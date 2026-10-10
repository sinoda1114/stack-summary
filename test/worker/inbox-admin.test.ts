import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addUserAlias, deleteUserAlias } from "../../src/worker/db/aliases";
import { createCategory, patchCategory } from "../../src/worker/db/category-admin";
import {
  listUnclassifiedTechs,
  listUnratedTechs,
  listUnreviewedSubcategories,
} from "../../src/worker/db/inbox";
import { mergeTech } from "../../src/worker/db/merge-tech";
import {
  createUserSubcategory,
  mergeSubcategory,
  patchSubcategory,
} from "../../src/worker/db/subcategory-admin";
import { aliasKey } from "../../src/worker/ingest/normalize";

const NOW = "2026-10-10T00:00:00.000Z";

describe("受け箱と分類の管理", () => {
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
      env.DB.prepare(
        `DELETE FROM categories
         WHERE id NOT IN (
           'language','frontend','backend','database','infra','dev-tools',
           'ai-model','ai-dev-tools','external-api'
         )`,
      ),
    ]);
  });

  it("自分自身への統合は拒否し、行を変えない", async () => {
    const techId = await insertTech("Hono", null, "unrated", null, null);
    const result = await mergeTech(env.DB, {
      sourceId: techId,
      intoId: techId,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, code: "self_merge" });
    expect(await techCount()).toBe(1);
  });

  it("両方に理由がある統合は、選ぶまで拒否する", async () => {
    const intoId = await insertTech("Hono", null, "adopted", "残す", "user");
    const sourceId = await insertTech("Honojs", null, "watching", "消す側", "model");
    const blocked = await mergeTech(env.DB, { sourceId, intoId, now: NOW });
    expect(blocked).toEqual({ ok: false, code: "reason_conflict" });
    expect(await techCount()).toBe(2);

    const merged = await mergeTech(env.DB, {
      sourceId,
      intoId,
      reasonChoice: "source",
      now: NOW,
    });
    expect(merged).toEqual({ ok: true });
    const into = await env.DB.prepare(
      "SELECT status, reason, reason_by, category_id, classified_by FROM techs WHERE id = ?",
    )
      .bind(intoId)
      .first<{
        status: string;
        reason: string;
        reason_by: string;
        category_id: string | null;
        classified_by: string | null;
      }>();
    expect(into).toEqual({
      status: "adopted",
      reason: "消す側",
      reason_by: "model",
      category_id: null,
      classified_by: "user",
    });
    expect(await techCount()).toBe(1);
  });

  it("衝突する別名とメモとタグは残す側を残し、正式名は別名になる", async () => {
    const importId = await insertImport();
    const intoId = await insertTech("Hono", null, "adopted", null, null);
    const sourceId = await insertTech("Honox", null, "unrated", null, null);
    await insertAlias(intoId, "Hono", "user");
    await insertAlias(sourceId, "Honox", "model");
    await insertAlias(sourceId, "hono-old", "model");
    const shared = await insertMemo(importId, "共有");
    await link(shared, intoId, "comparison");
    await link(shared, sourceId, "subject");
    const onlySource = await insertMemo(importId, "統合元だけ");
    await link(onlySource, sourceId, "subject");
    const tagId = await insertTag("Edge");
    await env.DB.prepare(
      "INSERT INTO tech_tags (tech_id, tag_id, source) VALUES (?, ?, 'user')",
    )
      .bind(intoId, tagId)
      .run();
    await env.DB.prepare(
      "INSERT INTO tech_tags (tech_id, tag_id, source) VALUES (?, ?, 'model')",
    )
      .bind(sourceId, tagId)
      .run();

    expect(await mergeTech(env.DB, { sourceId, intoId, now: NOW })).toEqual({ ok: true });

    const aliases = await env.DB.prepare(
      "SELECT alias_key, source, tech_id FROM tech_aliases ORDER BY alias_key",
    ).all<{ alias_key: string; source: string; tech_id: string }>();
    expect(aliases.results).toEqual([
      { alias_key: "hono", source: "user", tech_id: intoId },
      { alias_key: "honoold", source: "model", tech_id: intoId },
      { alias_key: "honox", source: "user", tech_id: intoId },
    ]);
    const relations = await env.DB.prepare(
      "SELECT memo_id, relation FROM memo_techs WHERE tech_id = ? ORDER BY relation",
    )
      .bind(intoId)
      .all<{ memo_id: string; relation: string }>();
    expect(relations.results).toEqual([
      { memo_id: shared, relation: "comparison" },
      { memo_id: onlySource, relation: "subject" },
    ]);
    const tag = await env.DB.prepare(
      "SELECT source FROM tech_tags WHERE tech_id = ? AND tag_id = ?",
    )
      .bind(intoId, tagId)
      .first<{ source: string }>();
    expect(tag).toEqual({ source: "user" });
  });

  it("受け箱は未評価と未分類を分け、確認一覧は未確認のモデル小分類だけ", async () => {
    await insertSubcategory("sub-rated", "backend", "評価済み", "user", 1);
    const open = await insertTech("未分類", null, "adopted", null, null);
    const rated = await insertTech("未評価", "sub-rated", "unrated", null, "model");
    await insertSubcategory("sub-fresh", "backend", "新しい", "ai", 0);
    await insertSubcategory("sub-seen", "backend", "見た", "ai", 1);

    expect((await listUnratedTechs(env.DB)).map((tech) => tech.id)).toEqual([rated]);
    expect((await listUnclassifiedTechs(env.DB)).map((tech) => tech.id)).toEqual([open]);
    expect(await listUnreviewedSubcategories(env.DB)).toEqual([
      {
        id: "sub-fresh",
        name: "新しい",
        categoryId: "backend",
        categoryName: "バックエンド",
      },
    ]);

    const created = await createUserSubcategory(env.DB, {
      categoryId: "backend",
      name: "利用者",
      now: NOW,
    });
    expect(created.ok).toBe(true);
    const listed = await listUnreviewedSubcategories(env.DB);
    expect(listed.some((item) => item.name === "利用者")).toBe(false);
  });

  it("小分類の統合は技術を移し、分類の出所を利用者にする", async () => {
    await insertSubcategory("sub-a", "backend", "A", "ai", 0);
    await insertSubcategory("sub-b", "backend", "B", "user", 1);
    const techId = await insertTech("Hono", "sub-a", "unrated", null, "model");
    expect(
      await mergeSubcategory(env.DB, { sourceId: "sub-a", intoId: "sub-a", now: NOW }),
    ).toEqual({ ok: false, code: "self_merge" });
    expect(
      await mergeSubcategory(env.DB, { sourceId: "sub-a", intoId: "sub-b", now: NOW }),
    ).toEqual({ ok: true });
    const tech = await env.DB.prepare(
      `SELECT t.category_id, t.classified_by, ts.subcategory_id
       FROM techs t
       JOIN tech_subcategories ts ON ts.tech_id = t.id
       WHERE t.id = ?`,
    )
      .bind(techId)
      .first<{ category_id: string; classified_by: string; subcategory_id: string }>();
    expect(tech).toEqual({
      category_id: "backend",
      classified_by: "user",
      subcategory_id: "sub-b",
    });
    expect(
      await env.DB.prepare("SELECT id FROM subcategories WHERE id = 'sub-a'").first(),
    ).toBeNull();
  });

  it("正式名の別名は消せない。大分類の改名と並びは書ける", async () => {
    const techId = await insertTech("Hono", null, "unrated", null, null);
    await insertAlias(techId, "Hono", "model");
    const key = aliasKey("Hono");
    if (key === null) {
      throw new Error("別名キーが空です");
    }
    expect(await deleteUserAlias(env.DB, techId, key)).toEqual({
      ok: false,
      code: "name_key",
    });
    expect(await addUserAlias(env.DB, techId, "Honojs")).toEqual({
      ok: true,
      key: "honojs",
    });
    const renamed = await patchSubcategory(env.DB, "missing", { name: " " });
    expect(renamed).toEqual({ ok: false, code: "not_found" });

    const created = await createCategory(env.DB, { name: "実験", now: NOW });
    if (!created.ok) {
      throw new Error("大分類を作れませんでした");
    }
    expect(await patchCategory(env.DB, created.id, { name: "実験後", sortOrder: 40 })).toEqual({
      ok: true,
    });
    const row = await env.DB.prepare(
      "SELECT name, sort_order FROM categories WHERE id = ?",
    )
      .bind(created.id)
      .first<{ name: string; sort_order: number }>();
    expect(row).toEqual({ name: "実験後", sort_order: 40 });
  });
});

async function techCount(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM techs").first<{
    count: number;
  }>();
  return row?.count ?? 0;
}

async function insertImport(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO imports (id, raw_text, raw_hash, status, created_at, updated_at)
     VALUES (?, '本文', ?, 'done', ?, ?)`,
  )
    .bind(id, id, NOW, NOW)
    .run();
  return id;
}

async function insertTech(
  name: string,
  subcategoryId: string | null,
  status: string,
  reason: string | null,
  classifiedBy: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  const key = aliasKey(name);
  await env.DB.prepare(
    `INSERT INTO techs (
       id, name, name_key, category_id, status, status_by, reason, reason_by,
       classified_by, created_at, updated_at
     ) VALUES (
       ?, ?, ?,
       (SELECT category_id FROM subcategories WHERE id = ?),
       ?, 'model', ?, ?, ?, ?, ?
     )`,
  )
    .bind(
      id,
      name,
      key,
      subcategoryId,
      status,
      reason,
      reason === null ? null : "model",
      classifiedBy,
      NOW,
      NOW,
    )
    .run();
  if (subcategoryId !== null) {
    await env.DB.prepare(
      "INSERT INTO tech_subcategories (tech_id, subcategory_id) VALUES (?, ?)",
    )
      .bind(id, subcategoryId)
      .run();
  }
  return id;
}

async function insertAlias(techId: string, label: string, source: string): Promise<void> {
  const key = aliasKey(label);
  await env.DB.prepare(
    "INSERT INTO tech_aliases (alias_key, alias, tech_id, source) VALUES (?, ?, ?, ?)",
  )
    .bind(key, label, techId, source)
    .run();
}

async function insertMemo(importId: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO memos (id, import_id, title, body, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, importId, title, title, NOW)
    .run();
  return id;
}

async function link(memoId: string, techId: string, relation: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO memo_techs (memo_id, tech_id, relation) VALUES (?, ?, ?)",
  )
    .bind(memoId, techId, relation)
    .run();
}

async function insertTag(name: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO tags (id, name, kind) VALUES (?, ?, 'topic')")
    .bind(id, name)
    .run();
  return id;
}

async function insertSubcategory(
  id: string,
  categoryId: string,
  name: string,
  createdBy: string,
  reviewed: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO subcategories (
       id, category_id, name, sort_order, created_by, reviewed, created_at
     ) VALUES (?, ?, ?, 1, ?, ?, ?)`,
  )
    .bind(id, categoryId, name, createdBy, reviewed, NOW)
    .run();
}
