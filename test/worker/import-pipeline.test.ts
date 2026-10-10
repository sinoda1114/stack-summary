import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InvalidModelOutput,
  type StructuredGenerateRequest,
  type StructuredGenerator,
} from "../../src/worker/ai/model-output";
import type { Classifier } from "../../src/worker/ai/classifier";
import type { ClefDecider } from "../../src/worker/ai/clef";
import {
  CLEF_CLASSIFY_VERSION,
  clefClassifier,
} from "../../src/worker/ai/clef-classifier";
import { findImportById, insertQueuedImport, updateImport } from "../../src/worker/db/imports";
import { loadOverview } from "../../src/worker/db/overview";
import { aliasKey } from "../../src/worker/ingest/normalize";
import {
  createImport,
  nextWorkflowId,
  reprocessImport,
  type ImportWorkflowClient,
} from "../../src/worker/routes/imports";
import { IMPORT_STEP_RETRY } from "../../src/worker/workflows/import-steps";
import {
  executeImport,
  type ImportStepRunner,
} from "../../src/worker/workflows/import-run";
import type { ImportRunner } from "../../src/worker/workflows/import-steps";

const NOW = "2026-10-10T00:00:00.000Z";

describe("取り込み", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM memo_techs"),
      env.DB.prepare("DELETE FROM memo_mentions"),
      env.DB.prepare("DELETE FROM memo_tags"),
      env.DB.prepare("DELETE FROM memo_urls"),
      env.DB.prepare("DELETE FROM memo_similars"),
      env.DB.prepare("DELETE FROM tech_tags"),
      env.DB.prepare("DELETE FROM tech_aliases"),
      env.DB.prepare("DELETE FROM memos"),
      env.DB.prepare("DELETE FROM techs"),
      env.DB.prepare("DELETE FROM tags"),
      env.DB.prepare("DELETE FROM subcategories"),
      env.DB.prepare("DELETE FROM imports"),
    ]);
  });

  it("モックの分割・抽出・分類でメモと未評価の技術を作る", async () => {
    await insertSubcategory("sub-hono", "backend", "Web フレームワーク");
    const importId = await queue("Hono がよい\nhttps://hono.dev");
    const step = immediateStep();
    const script = scripted([
      splitBody("Hono がよい https://hono.dev", 1),
      extractBody("Hono", "subject", ["honojs"], "Cloudflare"),
    ]);
    await executeImport(
      step,
      runner(script.generator, clefClassifier(choiceDecider("sub-hono"))),
      importId,
    );

    expect(step.configs.every((config) => config.retries.limit === 3)).toBe(true);
    expect(IMPORT_STEP_RETRY.retries).toEqual({
      limit: 3,
      delay: "1 second",
      backoff: "exponential",
    });
    const stored = await findImportById(env.DB, importId);
    expect(stored?.status).toBe("done");
    expect(stored?.skippedCount).toBe(1);
    expect(stored?.memoCount).toBe(1);
    const tech = await env.DB.prepare(
      "SELECT name, status, status_by, subcategory_id, classified_by, prompt_version FROM techs",
    ).first<{
      name: string;
      status: string;
      status_by: string;
      subcategory_id: string;
      classified_by: string;
      prompt_version: string;
    }>();
    expect(tech).toEqual({
      name: "Hono",
      status: "unrated",
      status_by: "model",
      subcategory_id: "sub-hono",
      classified_by: "model",
      prompt_version: CLEF_CLASSIFY_VERSION,
    });
    const alias = await env.DB.prepare(
      "SELECT alias_key FROM tech_aliases WHERE alias_key = 'honojs'",
    ).first();
    expect(alias).not.toBeNull();
    expect(script.requests.map((request) => request.model)).toEqual([
      "test-model-heavy",
      "test-model-light",
    ]);
    const overview = await loadOverview(env.DB, {
      status: null,
      tag: null,
      q: null,
    });
    const backend = overview.find((category) => category.id === "backend");
    const group = backend?.subcategories.find((item) => item.id === "sub-hono");
    expect(group?.techs.map((item) => item.name)).toEqual(["Hono"]);
  });

  it("本文があるメモの URL が重なっても同一にせず、似たメモにする", async () => {
    const first = await queue("一つ目 https://example.com/a を見た");
    const second = await queue("二つ目 https://example.com/a も見た");
    await executeImport(
      immediateStep(),
      runner(scripted([splitBody("一つ目 https://example.com/a を見た", 0), emptyExtract()]).generator),
      first,
    );
    await executeImport(
      immediateStep(),
      runner(scripted([splitBody("二つ目 https://example.com/a も見た", 0), emptyExtract()]).generator),
      second,
    );
    const memos = await env.DB.prepare("SELECT id FROM memos").all();
    expect(memos.results).toHaveLength(2);
    const similars = await env.DB.prepare("SELECT memo_id FROM memo_similars").all();
    expect(similars.results.length).toBeGreaterThan(0);
  });

  it("URL だけのメモは url_set_hash で 1 行にする", async () => {
    const body = "https://example.com/b\nhttps://example.com/a";
    const first = await queue(body);
    const second = await queue(`出典違い\n${body}`);
    const split = JSON.stringify({
      memos: [{ title: "links", body, memoDate: null, urls: [] }],
      skippedCount: 0,
    });
    await executeImport(immediateStep(), runner(scripted([split, emptyExtract()]).generator), first);
    await executeImport(immediateStep(), runner(scripted([split, emptyExtract()]).generator), second);
    const memos = await env.DB.prepare("SELECT id FROM memos").all();
    expect(memos.results).toHaveLength(1);
  });

  it("不正な JSON のあとは failed を書く", async () => {
    const importId = await queue("壊れた出力");
    await executeImport(immediateStep(), runner(scripted(["{", "{"]).generator), importId);
    const stored = await findImportById(env.DB, importId);
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toContain("モデルの出力が不正です");
    const techs = await env.DB.prepare("SELECT id FROM techs").all();
    expect(techs.results).toHaveLength(0);
  });

  it("再処理は利用者の別名と分類と既存の関係を残し、モデルの別名だけ入れ直す", async () => {
    await insertSubcategory("sub-user", "backend", "利用者");
    await insertSubcategory("sub-model", "backend", "モデル");
    const importId = await queue("Hono を比較した");
    await executeImport(
      immediateStep(),
      runner(
        scripted([
          splitBody("Hono を比較した", 0),
          extractBody("Hono", "comparison", ["oldname"], "Cloudflare"),
          classifyExisting("sub-model"),
        ]).generator,
      ),
      importId,
    );
    const tech = await env.DB.prepare("SELECT id FROM techs").first<{ id: string }>();
    if (tech === null) {
      throw new Error("技術がありません");
    }
    const keep = aliasKey("Keep Me");
    if (keep === null) {
      throw new Error("別名キーが空です");
    }
    await env.DB.prepare(
      `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
       VALUES (?, 'Keep Me', ?, 'user')`,
    )
      .bind(keep, tech.id)
      .run();
    await env.DB.prepare(
      `UPDATE techs
       SET subcategory_id = 'sub-user', classified_by = 'user'
       WHERE id = ?`,
    )
      .bind(tech.id)
      .run();

    await executeImport(
      immediateStep(),
      runner(
        scripted([
          splitBody("Hono を比較した", 0),
          extractBody("Hono", "subject", ["newname"], "Cloudflare"),
          classifyExisting("sub-model"),
        ]).generator,
      ),
      importId,
    );

    const aliases = await env.DB.prepare(
      "SELECT alias_key, source FROM tech_aliases ORDER BY alias_key",
    ).all<{ alias_key: string; source: string }>();
    expect(aliases.results.map((row) => row.alias_key)).toEqual(["hono", "keepme", "newname"]);
    expect(aliases.results.find((row) => row.alias_key === "keepme")?.source).toBe("user");
    const relation = await env.DB.prepare("SELECT relation FROM memo_techs").first<{
      relation: string;
    }>();
    expect(relation?.relation).toBe("comparison");
    const classified = await env.DB.prepare(
      "SELECT subcategory_id, classified_by FROM techs WHERE id = ?",
    )
      .bind(tech.id)
      .first<{ subcategory_id: string; classified_by: string }>();
    expect(classified).toEqual({
      subcategory_id: "sub-user",
      classified_by: "user",
    });
  });

  it("同じ取り込みの後続抽出は、先に付いたモデル別名を消さない", async () => {
    await insertSubcategory("sub-hono", "backend", "Web フレームワーク");
    const importId = await queue("Hono と別名");
    const split = JSON.stringify({
      memos: [
        { title: "先", body: "先に Hono.js", memoDate: "2026-10-10", urls: [] },
        { title: "後", body: "後から Hono", memoDate: "2026-10-10", urls: [] },
      ],
      skippedCount: 0,
    });
    await executeImport(
      immediateStep(),
      runner(
        scripted([
          split,
          extractBody("Hono", "subject", ["honojs"], "Cloudflare"),
          extractBody("Hono", "comparison", ["honox"], "Cloudflare"),
          classifyExisting("sub-hono"),
        ]).generator,
      ),
      importId,
    );
    const aliases = await env.DB.prepare(
      "SELECT alias_key FROM tech_aliases ORDER BY alias_key",
    ).all<{ alias_key: string }>();
    expect(aliases.results.map((row) => row.alias_key)).toEqual([
      "hono",
      "honojs",
      "honox",
    ]);
  });

  it("Workflow を作れないときは原文を残して failed にする", async () => {
    const workflow: ImportWorkflowClient = {
      async get() {
        throw new Error("missing");
      },
      async create() {
        throw new Error("boom");
      },
    };
    const failed = await createImport({
      db: env.DB,
      workflow,
      maxChars: 50000,
      text: "失敗する原文",
      sourceLabel: null,
      now: NOW,
    });
    expect(failed.status).toBe(500);
    expect(failed.error?.message).toBe("Workflow を起動できませんでした");
    const row = await env.DB.prepare(
      "SELECT status, error, raw_text FROM imports",
    ).first<{ status: string; error: string; raw_text: string }>();
    expect(row).toEqual({
      status: "failed",
      error: "Workflow を起動できませんでした",
      raw_text: "失敗する原文",
    });
  });

  it("同じ原文の同時挿入は既存行を 200 で返す", async () => {
    const workflow = fakeWorkflow();
    const input = {
      db: env.DB,
      workflow,
      maxChars: 50000,
      text: "同時の原文",
      sourceLabel: null,
      now: NOW,
    };
    const [first, second] = await Promise.all([
      createImport(input),
      createImport(input),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 202]);
    expect(first.data?.id).toBe(second.data?.id);
    expect(workflow.created).toHaveLength(1);
  });

  it("URL だけのメモも重なる URL を似たメモにする", async () => {
    const firstBody = "https://example.com/shared\nhttps://example.com/a";
    const secondBody = "https://example.com/shared\nhttps://example.com/b";
    const first = await queue(firstBody);
    const second = await queue(secondBody);
    const split = (body: string) =>
      JSON.stringify({
        memos: [{ title: "links", body, memoDate: null, urls: [] }],
        skippedCount: 0,
      });
    await executeImport(
      immediateStep(),
      runner(scripted([split(firstBody), emptyExtract()]).generator),
      first,
    );
    await executeImport(
      immediateStep(),
      runner(scripted([split(secondBody), emptyExtract()]).generator),
      second,
    );
    const similars = await env.DB.prepare(
      "SELECT memo_id FROM memo_similars",
    ).all();
    expect(similars.results).toHaveLength(2);
  });

  it("同じ原文は Workflow を起動せず、再処理の ID は回数を付ける", async () => {
    const workflow = fakeWorkflow();
    const created = await createImport({
      db: env.DB,
      workflow,
      maxChars: 50000,
      text: "同じ原文",
      sourceLabel: null,
      now: NOW,
    });
    expect(created.status).toBe(202);
    expect(workflow.created[0]?.id).toBe(created.data?.id);
    const again = await createImport({
      db: env.DB,
      workflow,
      maxChars: 50000,
      text: "同じ原文",
      sourceLabel: null,
      now: NOW,
    });
    expect(again.status).toBe(200);
    expect(workflow.created).toHaveLength(1);
    const empty = await createImport({
      db: env.DB,
      workflow,
      maxChars: 50000,
      text: "   ",
      sourceLabel: null,
      now: NOW,
    });
    expect(empty.status).toBe(400);
    expect(empty.error?.code).toBe("empty");
    const huge = await createImport({
      db: env.DB,
      workflow,
      maxChars: 50000,
      text: "a".repeat(50001),
      sourceLabel: null,
      now: NOW,
    });
    expect(huge.error?.code).toBe("too_long");

    const importId = created.data?.id;
    if (importId === undefined) {
      throw new Error("取り込み ID がありません");
    }
    const blocked = await reprocessImport({
      db: env.DB,
      workflow,
      id: importId,
      now: NOW,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.error?.code).toBe("in_progress");
    await updateImport(env.DB, importId, {
      status: "done",
      error: null,
      now: NOW,
    });
    const reprocessed = await reprocessImport({
      db: env.DB,
      workflow,
      id: importId,
      now: NOW,
    });
    expect(reprocessed.status).toBe(202);
    expect(reprocessed.data?.status).toBe("queued");
    expect(reprocessed.data?.error).toBeNull();
    expect(workflow.created[1]?.id).toBe(`${importId}-1`);
    expect(await nextWorkflowId(workflow, importId)).toBe(`${importId}-2`);
  });
});

function runner(
  generator: StructuredGenerator,
  classifier: Classifier = unclassifiedClassifier(),
): ImportRunner {
  return {
    db: env.DB,
    generator,
    modelLight: "test-model-light",
    modelHeavy: "test-model-heavy",
    now: NOW,
    classifier,
  };
}

function unclassifiedClassifier(): Classifier {
  return {
    version: CLEF_CLASSIFY_VERSION,
    async classify() {
      return { kind: "unclassified", confidence: 0 };
    },
  };
}

function choiceDecider(subcategory: string): ClefDecider {
  return {
    async decide() {
      return {
        answers: {
          subcategory: {
            type: "choice",
            choice: subcategory,
            probabilities: { [subcategory]: 1 },
            confidence: 0.8,
          },
        },
      };
    },
  };
}

function immediateStep(): ImportStepRunner & {
  configs: (typeof IMPORT_STEP_RETRY)[];
} {
  const configs: (typeof IMPORT_STEP_RETRY)[] = [];
  return {
    configs,
    async do(_name, config, callback) {
      configs.push(config);
      return callback();
    },
  };
}

function scripted(responses: readonly string[]): {
  generator: StructuredGenerator;
  requests: StructuredGenerateRequest[];
} {
  const requests: StructuredGenerateRequest[] = [];
  return {
    requests,
    generator: {
      async generate(next: StructuredGenerateRequest): Promise<string> {
        requests.push(next);
        const response = responses[requests.length - 1];
        if (response === undefined) {
          throw new InvalidModelOutput("モックの応答が足りません");
        }
        return response;
      },
    },
  };
}

function splitBody(body: string, skippedCount: number): string {
  return JSON.stringify({
    memos: [{ title: "題", body, memoDate: "2026-10-10", urls: [] }],
    skippedCount,
  });
}

function extractBody(
  name: string,
  relation: "subject" | "comparison" | "mention",
  aliases: string[],
  vendor: string,
): string {
  return JSON.stringify({
    techs: [
      {
        name,
        relation,
        aliases,
        tags: [{ name: vendor, kind: "vendor" }],
      },
    ],
  });
}

function emptyExtract(): string {
  return JSON.stringify({ techs: [] });
}

function classifyExisting(subcategoryId: string): string {
  return JSON.stringify({ kind: "existing", subcategoryId, confidence: 0.2 });
}

async function queue(text: string): Promise<string> {
  const id = crypto.randomUUID();
  await insertQueuedImport(env.DB, {
    id,
    rawText: text,
    rawHash: crypto.randomUUID(),
    sourceLabel: null,
    now: NOW,
  });
  return id;
}

async function insertSubcategory(
  id: string,
  categoryId: string,
  name: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO subcategories (
       id, category_id, name, sort_order, created_by, reviewed, created_at
     ) VALUES (?, ?, ?, 1, 'user', 1, ?)`,
  )
    .bind(id, categoryId, name, NOW)
    .run();
}

function fakeWorkflow(): ImportWorkflowClient & {
  created: { id?: string; params?: { importId: string } }[];
} {
  const ids = new Set<string>();
  const created: { id?: string; params?: { importId: string } }[] = [];
  return {
    created,
    async get(id: string): Promise<unknown> {
      if (!ids.has(id)) {
        throw new Error("missing");
      }
      return { id };
    },
    async create(options): Promise<unknown> {
      if (options.id === undefined || ids.has(options.id)) {
        throw new Error("create");
      }
      ids.add(options.id);
      created.push(options);
      return { id: options.id };
    },
  };
}
