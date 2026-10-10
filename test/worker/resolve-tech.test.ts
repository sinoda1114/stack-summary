import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  resolveExtractedTech,
  type ResolveExtractedTechResult,
} from "../../src/worker/ingest/resolve-tech";

const NOW = "2026-10-10T00:00:00.000Z";

describe("別名の照合と新機能の解決", () => {
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
      env.DB.prepare("DELETE FROM imports"),
    ]);
  });

  it("当たらない名前は未評価の技術にし、正式名のキーも別名に入れる", async () => {
    const memoId = await insertMemo();
    const result = await resolveExtractedTech(env.DB, {
      memoId,
      name: "Hono",
      aliases: ["", "-", "Hono"],
      relation: "subject",
      now: NOW,
    });

    expect(result.kind).toBe("attached");
    if (result.kind !== "attached") {
      return;
    }
    expect(result.created).toBe(true);
    expect(result.relation).toBe("subject");
    expect(result.discarded).toEqual(["", "-"]);

    const tech = await env.DB.prepare(
      `SELECT id, name, name_key, subcategory_id, status, status_by
       FROM techs
       WHERE id = ?`,
    )
      .bind(result.techId)
      .first<{
        id: string;
        name: string;
        name_key: string;
        subcategory_id: string | null;
        status: string;
        status_by: string;
      }>();
    expect(tech).toEqual({
      id: result.techId,
      name: "Hono",
      name_key: "hono",
      subcategory_id: null,
      status: "unrated",
      status_by: "model",
    });

    const aliases = await env.DB.prepare(
      `SELECT alias_key, alias, source
       FROM tech_aliases
       WHERE tech_id = ?
       ORDER BY alias_key`,
    )
      .bind(result.techId)
      .all<{ alias_key: string; alias: string; source: string }>();
    expect(aliases.results).toEqual([
      { alias_key: "hono", alias: "Hono", source: "model" },
    ]);

    const link = await env.DB.prepare(
      "SELECT relation FROM memo_techs WHERE memo_id = ? AND tech_id = ?",
    )
      .bind(memoId, result.techId)
      .first<{ relation: string }>();
    expect(link).toEqual({ relation: "subject" });
  });

  it("正規化して同じ正式名は 1 行にする", async () => {
    const firstMemo = await insertMemo();
    const first = await resolveExtractedTech(env.DB, {
      memoId: firstMemo,
      name: "Cloudflare Workers",
      aliases: [],
      relation: "subject",
      now: NOW,
    });
    const secondMemo = await insertMemo();
    const second = await resolveExtractedTech(env.DB, {
      memoId: secondMemo,
      name: "Cloudflare-Workers",
      aliases: [],
      relation: "comparison",
      now: NOW,
    });

    expect(first.kind).toBe("attached");
    expect(second.kind).toBe("attached");
    if (first.kind !== "attached" || second.kind !== "attached") {
      return;
    }
    expect(second.techId).toBe(first.techId);
    expect(second.created).toBe(false);
    expect(await techCount()).toBe(1);

    const kept = await env.DB.prepare(
      "SELECT name, relation FROM techs JOIN memo_techs ON memo_techs.tech_id = techs.id WHERE memo_techs.memo_id = ?",
    )
      .bind(secondMemo)
      .first<{ name: string; relation: string }>();
    expect(kept).toEqual({ name: "Cloudflare Workers", relation: "comparison" });
  });

  it("空白を除いただけでは Workers と Cloudflare Workers を同一にしない", async () => {
    const workers = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo(),
      name: "Workers",
      aliases: [],
      relation: "subject",
      now: NOW,
    });
    const cloudflare = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo(),
      name: "Cloudflare Workers",
      aliases: [],
      relation: "subject",
      now: NOW,
    });
    expect(workers.kind).toBe("attached");
    expect(cloudflare.kind).toBe("attached");
    if (workers.kind !== "attached" || cloudflare.kind !== "attached") {
      return;
    }
    expect(workers.techId).not.toBe(cloudflare.techId);
    expect(await techCount()).toBe(2);
  });

  it("別名キーが当たった呼び方は既存の技術に結ぶ", async () => {
    const first = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo(),
      name: "Cloudflare Workers",
      aliases: ["Workers"],
      relation: "subject",
      now: NOW,
    });
    const secondMemo = await insertMemo();
    const second = await resolveExtractedTech(env.DB, {
      memoId: secondMemo,
      name: "Workers",
      aliases: [],
      relation: "subject",
      now: NOW,
    });

    expect(attachedId(first)).toBe(attachedId(second));
    expect(second.kind === "attached" && second.created).toBe(false);
    expect(await techCount()).toBe(1);

    const aliases = await env.DB.prepare(
      "SELECT alias_key FROM tech_aliases ORDER BY alias_key",
    ).all<{ alias_key: string }>();
    expect(aliases.results.map((row) => row.alias_key)).toEqual([
      "cloudflareworkers",
      "workers",
    ]);
    const link = await env.DB.prepare(
      "SELECT tech_id FROM memo_techs WHERE memo_id = ?",
    )
      .bind(secondMemo)
      .first<{ tech_id: string }>();
    expect(link?.tech_id).toBe(attachedId(first));
  });

  it("新機能は親の名前で照合し、そのメモを親の関連メモにする", async () => {
    const parent = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo("親のメモ"),
      name: "Cloudflare Workers",
      aliases: ["Workers"],
      relation: "subject",
      now: NOW,
    });
    const featureMemo = await insertMemo("Worker Previews のメモ");
    const feature = await resolveExtractedTech(env.DB, {
      memoId: featureMemo,
      name: "Cloudflare Workers",
      aliases: ["Workers"],
      relation: "subject",
      now: NOW,
    });

    expect(feature.kind).toBe("attached");
    if (feature.kind !== "attached" || parent.kind !== "attached") {
      throw new Error("親技術に結び付けられませんでした");
    }
    expect(feature.created).toBe(false);
    expect(feature.techId).toBe(parent.techId);
    expect(await techCount()).toBe(1);

    const names = await env.DB.prepare("SELECT name FROM techs").all<{
      name: string;
    }>();
    expect(names.results.map((row) => row.name)).toEqual(["Cloudflare Workers"]);
    const featureKey = await env.DB.prepare(
      "SELECT id FROM techs WHERE name_key = 'workerpreviews'",
    ).first<{ id: string }>();
    expect(featureKey).toBeNull();

    const link = await env.DB.prepare(
      "SELECT tech_id, relation FROM memo_techs WHERE memo_id = ?",
    )
      .bind(featureMemo)
      .first<{ tech_id: string; relation: string }>();
    expect(link).toEqual({ tech_id: parent.techId, relation: "subject" });
  });

  it("すでに関係があれば、その関係を残す", async () => {
    const memoId = await insertMemo();
    const first = await resolveExtractedTech(env.DB, {
      memoId,
      name: "Hono",
      aliases: [],
      relation: "comparison",
      now: NOW,
    });
    const second = await resolveExtractedTech(env.DB, {
      memoId,
      name: "hono",
      aliases: [],
      relation: "subject",
      now: NOW,
    });
    expect(attachedId(second)).toBe(attachedId(first));
    const links = await env.DB.prepare(
      "SELECT relation FROM memo_techs WHERE memo_id = ?",
    )
      .bind(memoId)
      .all<{ relation: string }>();
    expect(links.results).toEqual([{ relation: "comparison" }]);
  });

  it("言及は技術にせず、メモ側に残す", async () => {
    const memoId = await insertMemo();
    const result = await resolveExtractedTech(env.DB, {
      memoId,
      name: "Laya",
      aliases: ["Something"],
      relation: "mention",
      now: NOW,
    });
    expect(result).toEqual({
      kind: "mention",
      name: "Laya",
      discarded: [],
    });
    expect(await techCount()).toBe(0);
    const mention = await env.DB.prepare(
      "SELECT name FROM memo_mentions WHERE memo_id = ?",
    )
      .bind(memoId)
      .first<{ name: string }>();
    expect(mention).toEqual({ name: "Laya" });
  });

  it("空になった名前は捨て、技術を作らない", async () => {
    const memoId = await insertMemo();
    const result = await resolveExtractedTech(env.DB, {
      memoId,
      name: " - ",
      aliases: ["Hono"],
      relation: "subject",
      now: NOW,
    });
    expect(result).toEqual({ kind: "discarded", discarded: [" - "] });
    expect(await techCount()).toBe(0);
    const links = await env.DB.prepare(
      "SELECT tech_id FROM memo_techs WHERE memo_id = ?",
    )
      .bind(memoId)
      .all();
    expect(links.results).toEqual([]);
  });

  it("利用者の別名はモデルの照合で上書きしない", async () => {
    const created = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo(),
      name: "Cloudflare Workers",
      aliases: ["Workers"],
      relation: "subject",
      now: NOW,
    });
    await env.DB.prepare(
      `UPDATE tech_aliases
       SET alias = 'WORKERS', source = 'user'
       WHERE alias_key = 'workers'`,
    ).run();

    const again = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo(),
      name: "Workers",
      aliases: ["Cloudflare Workers"],
      relation: "subject",
      now: NOW,
    });
    expect(attachedId(again)).toBe(attachedId(created));
    const alias = await env.DB.prepare(
      "SELECT alias, source, tech_id FROM tech_aliases WHERE alias_key = 'workers'",
    ).first<{ alias: string; source: string; tech_id: string }>();
    expect(alias).toEqual({
      alias: "WORKERS",
      source: "user",
      tech_id: attachedId(created),
    });
  });

  it("正式名が既存技術に当たるとき、別技術の別名は奪わない", async () => {
    const alpha = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo(),
      name: "Alpha",
      aliases: [],
      relation: "subject",
      now: NOW,
    });
    const beta = await resolveExtractedTech(env.DB, {
      memoId: await insertMemo(),
      name: "Beta",
      aliases: ["Shared"],
      relation: "subject",
      now: NOW,
    });
    const memoId = await insertMemo();
    const resolved = await resolveExtractedTech(env.DB, {
      memoId,
      name: "Alpha",
      aliases: ["Shared"],
      relation: "subject",
      now: NOW,
    });

    expect(attachedId(resolved)).toBe(attachedId(alpha));
    expect(await techCount()).toBe(2);
    const shared = await env.DB.prepare(
      "SELECT tech_id FROM tech_aliases WHERE alias_key = 'shared'",
    ).first<{ tech_id: string }>();
    expect(shared?.tech_id).toBe(attachedId(beta));
    const link = await env.DB.prepare(
      "SELECT tech_id FROM memo_techs WHERE memo_id = ?",
    )
      .bind(memoId)
      .first<{ tech_id: string }>();
    expect(link?.tech_id).toBe(attachedId(alpha));
  });
});

async function insertMemo(body = "本文"): Promise<string> {
  const importId = crypto.randomUUID();
  const memoId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO imports (id, raw_text, raw_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?)`,
    ).bind(importId, body, crypto.randomUUID(), NOW, NOW),
    env.DB.prepare(
      `INSERT INTO memos (id, import_id, title, body, created_at)
       VALUES (?, ?, 'タイトル', ?, ?)`,
    ).bind(memoId, importId, body, NOW),
  ]);
  return memoId;
}

async function techCount(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM techs").first<{
    n: number;
  }>();
  if (row === null) {
    throw new Error("技術の件数を読めませんでした");
  }
  return row.n;
}

function attachedId(result: ResolveExtractedTechResult): string {
  if (result.kind !== "attached") {
    throw new Error("技術に結び付きませんでした");
  }
  return result.techId;
}
