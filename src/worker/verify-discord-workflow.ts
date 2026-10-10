import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from "cloudflare:workers";
import { classifyTech } from "./ai/classifier";
import { clefBinding, clefDecider } from "./ai/clef";
import { clefClassifier } from "./ai/clef-classifier";
import { geminiGeneratorFromApiKey } from "./ai/gemini";
import {
  geminiResponseSchema,
  InvalidModelOutput,
  type StructuredGenerator,
} from "./ai/model-output";
import {
  classifyContents,
  classifySchema,
  classifySystemPrompt,
} from "./ai/prompts/classify.v1";
import {
  extractSystemPrompt,
  extractTechSchema,
  type ExtractTechOutput,
} from "./ai/prompts/extract.v1";
import { readGeminiRuntime } from "./env";
import { upsertTag } from "./db/tags";
import { classifyTechRow, listCategories, listSubcategories } from "./db/taxonomy";
import type { SavedMemo } from "./db/memos";
import { resolveExtractedTech } from "./ingest/resolve-tech";

export const VERIFY_CALL_LIMIT = 325;

const STEP: WorkflowStepConfig = {
  retries: { limit: 0, delay: "1 second", backoff: "exponential" },
  timeout: "2 minutes",
  sensitive: "output",
};

const EMPTY_EXTRACT: ExtractTechOutput = { techs: [] };

export class VerifyDiscordWorkflow extends WorkflowEntrypoint<Env, Record<string, never>> {
  override async run(
    event: WorkflowEvent<Record<string, never>>,
    step: WorkflowStep,
  ): Promise<void> {
    void event;
    const ids = await step.do("list-posts", STEP, async () => {
      const listed = await this.env.DB.prepare(
        "SELECT post_id FROM verify_posts ORDER BY CAST(post_id AS INTEGER)",
      ).all<{ post_id: string }>();
      return listed.results.map((row) => row.post_id);
    });
    for (const postId of ids) {
      await step.do(`memo-${postId}`, STEP, async () => {
        try {
          await extractPost(this.env, postId);
          return { ok: true as const };
        } catch (error) {
          await rememberNote(this.env.DB, publicModelError(error));
          return { ok: false as const };
        }
      });
    }
    const applyJobs = await step.do("list-applies", STEP, async () => {
      const listed = await this.env.DB.prepare(
        "SELECT memo_id, payload FROM verify_extracts ORDER BY memo_id",
      ).all<{ memo_id: string; payload: string }>();
      const jobs: { memoId: string; index: number }[] = [];
      for (const row of listed.results) {
        const extracted = parseStoredExtract(row.payload);
        for (let index = 0; index < extracted.techs.length; index += 1) {
          jobs.push({ memoId: row.memo_id, index });
        }
      }
      return jobs;
    });
    for (const [index, job] of applyJobs.entries()) {
      await step.do(`apply-${index}`, STEP, async () => {
        try {
          await applyOneTech(this.env, job.memoId, job.index);
          return { ok: true as const };
        } catch (error) {
          await rememberNote(this.env.DB, publicModelError(error));
          return { ok: false as const };
        }
      });
    }
    const techIds = await step.do("list-techs", STEP, async () => {
      const listed = await this.env.DB.prepare(
        `SELECT id FROM techs
         WHERE (classified_by IS NULL OR classified_by <> 'user')
           AND NOT EXISTS (
             SELECT 1 FROM verify_model_calls c
             WHERE c.kind = 'clef' AND c.call_key = techs.id
           )
         ORDER BY name
         LIMIT ?`,
      )
        .bind(VERIFY_CALL_LIMIT)
        .all<{ id: string }>();
      return listed.results.map((row) => row.id);
    });
    let clefStopped = false;
    for (const [index, techId] of techIds.entries()) {
      if (clefStopped) {
        break;
      }
      const result = await step.do(`clef-${index}`, STEP, async () => {
        try {
          const classified = await classifyOne(this.env, techId);
          return { classified, stop: false };
        } catch (error) {
          await rememberNote(this.env.DB, publicModelError(error));
          return { classified: false, stop: true };
        }
      });
      clefStopped = result.stop;
    }
    const sampleIds = await step.do("list-sample", STEP, async () => {
      const listed = await this.env.DB.prepare(
        `SELECT id FROM techs
         WHERE prompt_version = 'clef-flash.v1'
         ORDER BY name
         LIMIT 10`,
      ).all<{ id: string }>();
      return listed.results.map((row) => row.id);
    });
    let sampleStopped = false;
    for (const [index, techId] of sampleIds.entries()) {
      if (sampleStopped) {
        break;
      }
      const result = await step.do(`sample-${index}`, STEP, async () => {
        try {
          const compared = await compareOne(this.env, techId);
          return { compared, stop: false };
        } catch (error) {
          await rememberNote(this.env.DB, publicModelError(error));
          return { compared: false, stop: true };
        }
      });
      sampleStopped = result.stop;
    }
    await step.do("finish", STEP, async () => {
      await markDone(this.env.DB);
      return { ok: true as const };
    });
  }
}

async function extractPost(env: Env, postId: string): Promise<void> {
  const post = await env.DB.prepare(
    "SELECT post_id, title, body, posted_at, urls_json FROM verify_posts WHERE post_id = ?",
  )
    .bind(postId)
    .first<{
      post_id: string;
      title: string;
      body: string;
      posted_at: string;
      urls_json: string;
    }>();
  if (post === null) {
    return;
  }
  const now = new Date().toISOString();
  const memo = await ensureMemo(env.DB, post, now);
  await lightExtract(env, memo, now);
  await refreshJob(env.DB, "extract");
}

async function applyOneTech(env: Env, memoId: string, index: number): Promise<void> {
  const memo = await env.DB.prepare("SELECT id, title, body FROM memos WHERE id = ?")
    .bind(memoId)
    .first<{ id: string; title: string; body: string }>();
  const saved = await env.DB.prepare("SELECT payload FROM verify_extracts WHERE memo_id = ?")
    .bind(memoId)
    .first<{ payload: string }>();
  if (memo === null || saved === null) {
    return;
  }
  const tech = parseStoredExtract(saved.payload).techs[index];
  if (tech === undefined) {
    return;
  }
  const now = new Date().toISOString();
  const resolved = await resolveExtractedTech(env.DB, {
    memoId: memo.id,
    name: tech.name,
    aliases: tech.aliases,
    relation: tech.relation,
    now,
  });
  if (resolved.kind !== "attached") {
    return;
  }
  for (const tag of tech.tags) {
    if (tag.name.trim().length === 0) {
      continue;
    }
    const tagId = await upsertTag(env.DB, { name: tag.name, kind: tag.kind });
    await env.DB.prepare(
      `INSERT INTO tech_tags (tech_id, tag_id, source)
       VALUES (?, ?, 'model')
       ON CONFLICT(tech_id, tag_id) DO NOTHING`,
    )
      .bind(resolved.techId, tagId)
      .run();
    await env.DB.prepare(
      `INSERT INTO memo_tags (memo_id, tag_id, source)
       VALUES (?, ?, 'model')
       ON CONFLICT(memo_id, tag_id) DO NOTHING`,
    )
      .bind(memo.id, tagId)
      .run();
  }
}

async function lightExtract(
  env: Env,
  memo: SavedMemo,
  now: string,
): Promise<ExtractTechOutput> {
  const saved = await env.DB.prepare(
    "SELECT payload FROM verify_extracts WHERE memo_id = ?",
  )
    .bind(memo.id)
    .first<{ payload: string }>();
  if (saved !== null) {
    return parseStoredExtract(saved.payload);
  }
  const claimed = await claimCall(env.DB, "light", memo.id, now);
  if (!claimed) {
    return EMPTY_EXTRACT;
  }
  const runtime = readGeminiRuntime(env);
  if (runtime === null) {
    throw new Error("Gemini の設定がありません");
  }
  const generator = geminiGeneratorFromApiKey(env.GEMINI_API_KEY);
  await pauseBeforeModel();
  const extracted = await generateOnce(generator, {
    model: runtime.modelLight,
    system: extractSystemPrompt,
    contents: JSON.stringify({ title: memo.title, body: memo.body }),
    responseJsonSchema: geminiResponseSchema(extractTechSchema),
  }, extractTechSchema);
  const payload = JSON.stringify(extracted ?? EMPTY_EXTRACT);
  await env.DB.prepare(
    `INSERT INTO verify_extracts (memo_id, payload) VALUES (?, ?)
     ON CONFLICT(memo_id) DO NOTHING`,
  )
    .bind(memo.id, payload)
    .run();
  return extracted ?? EMPTY_EXTRACT;
}

async function classifyOne(env: Env, techId: string): Promise<boolean> {
  const categories = await listCategories(env.DB);
  const subcategories = await listSubcategories(env.DB);
  if (subcategories.length === 0) {
    await rememberNote(env.DB, "小分類がないため Clef は呼び出していません");
    return false;
  }
  const tech = await env.DB.prepare("SELECT id, name, classified_by FROM techs WHERE id = ?")
    .bind(techId)
    .first<{ id: string; name: string; classified_by: string | null }>();
  if (tech === null || tech.classified_by === "user") {
    return false;
  }
  const now = new Date().toISOString();
  const claimed = await claimCall(env.DB, "clef", tech.id, now);
  if (!claimed) {
    return false;
  }
  const context = await techContext(env.DB, tech.id, tech.name);
  await pauseBeforeModel();
  const classifier = clefClassifier(clefDecider(clefBinding(env.AI)));
  try {
    const accepted = await classifyTech(classifier, {
      tech: { name: tech.name, context },
      categories,
      subcategories,
    });
    const promptVersion = classifier.version;
    switch (accepted.kind) {
      case "existing":
        await classifyTechRow(env.DB, {
          techId: tech.id,
          subcategoryId: accepted.subcategoryId,
          classifiedBy: "model",
          promptVersion,
          now,
        });
        break;
      case "new":
      case "unclassified":
        await classifyTechRow(env.DB, {
          techId: tech.id,
          subcategoryId: null,
          classifiedBy: null,
          promptVersion,
          now,
        });
        break;
      default: {
        const unexpected: never = accepted;
        throw new Error(`未知の分類です: ${String(unexpected)}`);
      }
    }
  } catch (error) {
    if (!(error instanceof InvalidModelOutput)) {
      throw error;
    }
  }
  await refreshJob(env.DB, "classify");
  return true;
}

async function compareOne(env: Env, techId: string): Promise<boolean> {
  const runtime = readGeminiRuntime(env);
  if (runtime === null) {
    throw new Error("Gemini の設定がありません");
  }
  const tech = await env.DB.prepare(
    `SELECT t.id, t.name, c.name AS category_name, s.name AS subcategory_name
     FROM techs t
     LEFT JOIN subcategories s ON s.id = t.subcategory_id
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE t.id = ?`,
  )
    .bind(techId)
    .first<{
      id: string;
      name: string;
      category_name: string | null;
      subcategory_name: string | null;
    }>();
  if (tech === null) {
    return false;
  }
  const now = new Date().toISOString();
  const claimed = await claimCall(env.DB, "heavy", `sample:${tech.id}`, now);
  if (!claimed) {
    return false;
  }
  const categories = await listCategories(env.DB);
  const subcategories = await listSubcategories(env.DB);
  const context = await techContext(env.DB, tech.id, tech.name);
  const clefPlace =
    tech.category_name === null || tech.subcategory_name === null
      ? "未分類"
      : `${tech.category_name}/${tech.subcategory_name}`;
  let geminiPlace = "比較できず";
  try {
    await pauseBeforeModel();
    const parsed = await generateOnce(
      geminiGeneratorFromApiKey(env.GEMINI_API_KEY),
      {
        model: runtime.modelHeavy,
        system: classifySystemPrompt,
        contents: classifyContents({
          tech: { name: tech.name, context },
          categories,
          subcategories,
        }),
        responseJsonSchema: geminiResponseSchema(classifySchema),
      },
      classifySchema,
    );
    geminiPlace = geminiPlaceLabel(parsed, categories);
  } catch (error) {
    if (!(error instanceof InvalidModelOutput)) {
      throw error;
    }
  }
  await env.DB.prepare(
    `INSERT INTO verify_samples (tech_id, tech_name, clef_place, gemini_place)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tech_id) DO UPDATE SET
       clef_place = excluded.clef_place,
       gemini_place = excluded.gemini_place`,
  )
    .bind(tech.id, tech.name, clefPlace, geminiPlace)
    .run();
  await refreshJob(env.DB, "sample");
  return true;
}

function geminiPlaceLabel(
  parsed: { kind: string; subcategoryId?: string; categoryId?: string; name?: string } | null,
  categories: readonly { id: string; name: string }[],
): string {
  if (parsed === null) {
    return "比較できず";
  }
  if (parsed.kind === "unclassified") {
    return "未分類";
  }
  if (parsed.kind === "existing" && parsed.subcategoryId !== undefined) {
    return `既存:${parsed.subcategoryId}`;
  }
  if (parsed.kind === "new" && parsed.categoryId !== undefined && parsed.name !== undefined) {
    const category = categories.find((item) => item.id === parsed.categoryId);
    const categoryName = category?.name ?? parsed.categoryId;
    return `新設:${categoryName}/${parsed.name}`;
  }
  return "比較できず";
}

async function techContext(db: D1Database, techId: string, name: string): Promise<string> {
  const memo = await db
    .prepare(
      `SELECT m.title, m.body
       FROM memo_techs mt
       JOIN memos m ON m.id = mt.memo_id
       WHERE mt.tech_id = ?
       LIMIT 1`,
    )
    .bind(techId)
    .first<{ title: string; body: string }>();
  if (memo === null) {
    return name;
  }
  return `${memo.title}\n${memo.body}`;
}

async function ensureMemo(
  db: D1Database,
  post: {
    post_id: string;
    title: string;
    body: string;
    posted_at: string;
    urls_json: string;
  },
  now: string,
): Promise<SavedMemo> {
  const importId = `discord-import-${post.post_id}`;
  const memoId = `discord-memo-${post.post_id}`;
  const memoDate = /^\d{4}-\d{2}-\d{2}/.test(post.posted_at) ? post.posted_at.slice(0, 10) : null;
  await db
    .prepare(
      `INSERT INTO imports (
         id, raw_text, raw_hash, source_label, status, memo_count, skipped_count, error, created_at, updated_at
       ) VALUES (?, ?, ?, 'discord', 'done', 1, 0, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(importId, post.body, `discord-${post.post_id}`, now, now)
    .run();
  await db
    .prepare(
      `INSERT INTO memos (
         id, import_id, title, body, url_set_hash, memo_date, created_at
       ) VALUES (?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(memoId, importId, post.title, post.body, memoDate, now)
    .run();
  const urls = parseUrls(post.urls_json);
  if (urls.length > 0) {
    const placeholders = urls.map(() => "(?, ?)").join(", ");
    const statement = db.prepare(
      `INSERT INTO memo_urls (memo_id, url) VALUES ${placeholders}
       ON CONFLICT(memo_id, url) DO NOTHING`,
    );
    const binds: string[] = [];
    for (const url of urls) {
      binds.push(memoId, url);
    }
    await statement.bind(...binds).run();
  }
  return { id: memoId, title: post.title, body: post.body, urls };
}

function parseUrls(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

async function generateOnce<T>(
  generator: StructuredGenerator,
  request: {
    model: string;
    system: string;
    contents: string;
    responseJsonSchema: unknown;
  },
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): Promise<T | null> {
  const text = await generator.generate(request);
  try {
    const parsed: unknown = JSON.parse(text);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function claimCall(
  db: D1Database,
  kind: "light" | "heavy" | "clef",
  key: string,
  now: string,
): Promise<boolean> {
  const before = await callCount(db, kind);
  if (before >= VERIFY_CALL_LIMIT) {
    return false;
  }
  await db
    .prepare(
      `INSERT INTO verify_model_calls (kind, call_key, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(kind, call_key) DO NOTHING`,
    )
    .bind(kind, key, now)
    .run();
  const after = await callCount(db, kind);
  return after > before;
}

async function callCount(db: D1Database, kind: "light" | "heavy" | "clef"): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM verify_model_calls WHERE kind = ?")
    .bind(kind)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function parseStoredExtract(payload: string): ExtractTechOutput {
  try {
    const parsed: unknown = JSON.parse(payload);
    const result = extractTechSchema.safeParse(parsed);
    return result.success ? result.data : EMPTY_EXTRACT;
  } catch {
    return EMPTY_EXTRACT;
  }
}

function pauseBeforeModel(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
}

export function publicModelError(error: unknown): string {
  const message = error instanceof Error ? error.message : "モデルの呼び出しに失敗しました";
  if (/key|token|secret|bearer|aiza|api[_ -]?key/i.test(message)) {
    return "モデルの呼び出しに失敗しました";
  }
  return message.slice(0, 180);
}

async function rememberNote(db: D1Database, note: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO verify_job (id, phase, light_calls, heavy_calls, clef_calls, memos, note)
       VALUES ('discord', 'error', 0, 0, 0, 0, ?)
       ON CONFLICT(id) DO UPDATE SET note = excluded.note`,
    )
    .bind(note)
    .run();
}

async function refreshJob(db: D1Database, phase: string): Promise<void> {
  const counts = await callCounts(db);
  const memos = await db.prepare("SELECT COUNT(*) AS n FROM memos").first<{ n: number }>();
  await db
    .prepare(
      `INSERT INTO verify_job (id, phase, light_calls, heavy_calls, clef_calls, memos, note)
       VALUES ('discord', ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         phase = excluded.phase,
         light_calls = excluded.light_calls,
         heavy_calls = excluded.heavy_calls,
         clef_calls = excluded.clef_calls,
         memos = excluded.memos`,
    )
    .bind(phase, counts.light, counts.heavy, counts.clef, memos?.n ?? 0)
    .run();
}

async function markDone(db: D1Database): Promise<void> {
  await refreshJob(db, "done");
}

async function callCounts(db: D1Database): Promise<{ light: number; heavy: number; clef: number }> {
  const rows = await db
    .prepare("SELECT kind, COUNT(*) AS n FROM verify_model_calls GROUP BY kind")
    .all<{ kind: string; n: number }>();
  const counts = { light: 0, heavy: 0, clef: 0 };
  for (const row of rows.results) {
    if (row.kind === "light" || row.kind === "heavy" || row.kind === "clef") {
      counts[row.kind] = row.n;
    }
  }
  return counts;
}
