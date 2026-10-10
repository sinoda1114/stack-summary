import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { loadOverview } from "../../src/worker/db/overview";
import { loadTechDetail, patchTech } from "../../src/worker/db/tech-detail";

const NOW = "2026-10-10T00:00:00.000Z";

describe("全体図と技術詳細", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM memo_techs"),
      env.DB.prepare("DELETE FROM memo_mentions"),
      env.DB.prepare("DELETE FROM memo_tags"),
      env.DB.prepare("DELETE FROM memo_urls"),
      env.DB.prepare("DELETE FROM memo_similars"),
      env.DB.prepare("DELETE FROM tech_relations"),
      env.DB.prepare("DELETE FROM tech_subcategories"),
      env.DB.prepare("DELETE FROM tech_tags"),
      env.DB.prepare("DELETE FROM tech_aliases"),
      env.DB.prepare("DELETE FROM memos"),
      env.DB.prepare("DELETE FROM techs"),
      env.DB.prepare("DELETE FROM tags"),
      env.DB.prepare("DELETE FROM subcategories"),
      env.DB.prepare("DELETE FROM imports"),
    ]);
  });

  it("別名と理由で絞り、小分類が1つでも名前は API が返す", async () => {
    const importId = await insertImport();
    const subcategoryId = await insertSubcategory("backend", "フレームワーク");
    const hono = await insertTech("Hono", subcategoryId, "ルータとして使う");
    await env.DB.prepare(
      "INSERT INTO tech_aliases (alias_key, alias, tech_id, source) VALUES ('honojs', 'Honojs', ?, 'model')",
    )
      .bind(hono)
      .run();
    await insertTech("React", await insertSubcategory("frontend", "UI"), null);

    const byAlias = await loadOverview(env.DB, {
      status: null,
      tag: null,
      q: "Honojs",
    });
    expect(byAlias.map((category) => category.id)).toEqual(["backend"]);
    expect(byAlias[0]?.subcategories[0]?.name).toBe("フレームワーク");
    expect(byAlias[0]?.subcategories[0]?.techs.map((tech) => tech.name)).toEqual(["Hono"]);

    const byReason = await loadOverview(env.DB, {
      status: null,
      tag: null,
      q: "ルータ",
    });
    expect(byReason[0]?.subcategories[0]?.techs.map((tech) => tech.name)).toEqual(["Hono"]);
    expect(importId).toBeTruthy();
  });

  it("絞り込みで小分類が1件でも、大分類の小分類数は残す", async () => {
    const framework = await insertSubcategory("backend", "フレームワーク");
    await insertSubcategory("backend", "ランタイム");
    await insertTech("Hono", framework, null);

    const filtered = await loadOverview(env.DB, {
      status: "unrated",
      tag: null,
      q: null,
    });

    expect(filtered.map((category) => category.id)).toEqual(["backend"]);
    expect(filtered[0]?.subcategoryCount).toBe(2);
    expect(filtered[0]?.subcategories.map((subcategory) => subcategory.name)).toEqual(["フレームワーク"]);
    expect(filtered[0]?.ungrouped).toEqual([]);
  });

  it("小分類の無い技術は、空名の小分類ではなく ungrouped に入る", async () => {
    await insertSubcategory("backend", "フレームワーク");
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO techs (
         id, name, name_key, category_id, status, status_by, created_at, updated_at
       ) VALUES (?, '素の技術', 'plain', 'backend', 'unrated', 'model', ?, ?)`,
    )
      .bind(id, NOW, NOW)
      .run();
    const overview = await loadOverview(env.DB, { status: null, tag: null, q: null });
    const backend = overview.find((category) => category.id === "backend");
    expect(backend?.subcategories.every((subcategory) => subcategory.name.length > 0)).toBe(true);
    expect(backend?.ungrouped.map((tech) => tech.name)).toEqual(["素の技術"]);
  });

  it("関連メモは日付の降順で、日付が空なら後にする", async () => {
    const importId = await insertImport();
    const subcategoryId = await insertSubcategory("backend", "フレームワーク");
    const techId = await insertTech("Hono", subcategoryId, null);
    await linkMemo(importId, techId, "古い", "2026-01-01", "2026-01-01T00:00:00.000Z");
    await linkMemo(importId, techId, "新しい", "2026-10-01", "2026-02-01T00:00:00.000Z");
    await linkMemo(importId, techId, "日付なし", null, "2026-12-01T00:00:00.000Z");

    const detail = await loadTechDetail(env.DB, techId);
    expect(detail?.memos.map((memo) => memo.title)).toEqual(["新しい", "古い", "日付なし"]);

    const patched = await patchTech(
      env.DB,
      techId,
      { status: "adopted", reason: "本番で使う", subcategoryIds: [subcategoryId] },
      NOW,
    );
    expect(patched).toBe(true);
    const after = await loadTechDetail(env.DB, techId);
    expect(after?.status).toBe("adopted");
    expect(after?.statusBy).toBe("user");
    expect(after?.reasonBy).toBe("user");
    expect(after?.classifiedBy).toBe("user");
  });
});

async function insertImport(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO imports (
       id, raw_text, raw_hash, status, created_at, updated_at
     ) VALUES (?, '本文', ?, 'done', ?, ?)`,
  )
    .bind(id, id, NOW, NOW)
    .run();
  return id;
}

async function insertSubcategory(categoryId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO subcategories (
       id, category_id, name, sort_order, created_by, reviewed, created_at
     ) VALUES (?, ?, ?, 1, 'user', 1, ?)`,
  )
    .bind(id, categoryId, name, NOW)
    .run();
  return id;
}

async function insertTech(
  name: string,
  subcategoryId: string,
  reason: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO techs (
       id, name, name_key, category_id, status, status_by, reason, reason_by, created_at, updated_at
     ) VALUES (?, ?, ?, (SELECT category_id FROM subcategories WHERE id = ?), 'unrated', 'model', ?, ?, ?, ?)`,
  )
    .bind(id, name, name.toLowerCase(), subcategoryId, reason, reason === null ? null : "model", NOW, NOW)
    .run();
  await env.DB.prepare(
    "INSERT INTO tech_subcategories (tech_id, subcategory_id) VALUES (?, ?)",
  )
    .bind(id, subcategoryId)
    .run();
  return id;
}

async function linkMemo(
  importId: string,
  techId: string,
  title: string,
  memoDate: string | null,
  createdAt: string,
): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO memos (id, import_id, title, body, memo_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, importId, title, title, memoDate, createdAt)
    .run();
  await env.DB.prepare(
    "INSERT INTO memo_techs (memo_id, tech_id, relation) VALUES (?, ?, 'subject')",
  )
    .bind(id, techId)
    .run();
}
