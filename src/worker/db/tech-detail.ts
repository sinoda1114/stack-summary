import { isTechStatus, type TechStatus } from "../../shared/labels";
import { upsertTag } from "./tags";

export { isTechStatus };

export type TechDetail = {
  id: string;
  name: string;
  status: TechStatus;
  statusBy: "user" | "model";
  reason: string | null;
  reasonBy: "user" | "model" | null;
  categoryId: string | null;
  subcategoryIds: string[];
  classifiedBy: "user" | "model" | null;
  updatedAt: string;
  aliases: { key: string; label: string; source: "user" | "model" }[];
  tags: { name: string; kind: "topic" | "vendor" | "project"; source: "user" | "model" }[];
  memos: {
    id: string;
    title: string;
    body: string;
    memoDate: string | null;
    relation: "subject" | "comparison";
  }[];
};

export async function listTechSummaries(
  db: D1Database,
): Promise<{ id: string; name: string; status: TechStatus }[]> {
  const listed = await db
    .prepare("SELECT id, name, status FROM techs ORDER BY name")
    .all<{ id: string; name: string; status: TechStatus }>();
  return listed.results;
}

export async function loadTechDetail(
  db: D1Database,
  id: string,
): Promise<TechDetail | null> {
  const tech = await db
    .prepare(
      `SELECT id, name, status, status_by, reason, reason_by, category_id, classified_by, updated_at
       FROM techs WHERE id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      name: string;
      status: string;
      status_by: string;
      reason: string | null;
      reason_by: string | null;
      category_id: string | null;
      classified_by: string | null;
      updated_at: string;
    }>();
  if (tech === null || !isTechStatus(tech.status)) {
    return null;
  }
  const subcategories = await db
    .prepare(
      `SELECT ts.subcategory_id
       FROM tech_subcategories ts
       JOIN subcategories s ON s.id = ts.subcategory_id
       WHERE ts.tech_id = ? AND s.category_id = ?
       ORDER BY s.sort_order, s.name`,
    )
    .bind(id, tech.category_id)
    .all<{ subcategory_id: string }>();
  const aliases = await db
    .prepare(
      `SELECT alias_key, alias, source FROM tech_aliases
       WHERE tech_id = ? ORDER BY alias`,
    )
    .bind(id)
    .all<{ alias_key: string; alias: string; source: "user" | "model" }>();
  const tags = await db
    .prepare(
      `SELECT g.name, g.kind, tt.source
       FROM tech_tags tt
       JOIN tags g ON g.id = tt.tag_id
       WHERE tt.tech_id = ?
       ORDER BY g.name`,
    )
    .bind(id)
    .all<{ name: string; kind: "topic" | "vendor" | "project"; source: "user" | "model" }>();
  const memos = await db
    .prepare(
      `SELECT m.id, m.title, m.body, m.memo_date, mt.relation
       FROM memo_techs mt
       JOIN memos m ON m.id = mt.memo_id
       WHERE mt.tech_id = ?
       ORDER BY m.memo_date IS NULL, m.memo_date DESC, m.created_at DESC`,
    )
    .bind(id)
    .all<{
      id: string;
      title: string;
      body: string;
      memo_date: string | null;
      relation: "subject" | "comparison";
    }>();
  return {
    id: tech.id,
    name: tech.name,
    status: tech.status,
    statusBy: tech.status_by === "user" ? "user" : "model",
    reason: tech.reason,
    reasonBy: tech.reason_by === "user" || tech.reason_by === "model" ? tech.reason_by : null,
    categoryId: tech.category_id,
    subcategoryIds: subcategories.results.map((row) => row.subcategory_id),
    classifiedBy:
      tech.classified_by === "user" || tech.classified_by === "model"
        ? tech.classified_by
        : null,
    updatedAt: tech.updated_at,
    aliases: aliases.results.map((alias) => ({
      key: alias.alias_key,
      label: alias.alias,
      source: alias.source,
    })),
    tags: tags.results,
    memos: memos.results.map((memo) => ({
      id: memo.id,
      title: memo.title,
      body: memo.body,
      memoDate: memo.memo_date,
      relation: memo.relation,
    })),
  };
}

export async function patchTech(
  db: D1Database,
  id: string,
  patch: {
    status?: TechStatus;
    reason?: string | null;
    categoryId?: string | null;
    subcategoryIds?: string[];
    tags?: { name: string; kind: "topic" | "vendor" | "project" }[];
  },
  now: string,
): Promise<boolean> {
  const current = await db
    .prepare("SELECT id, category_id FROM techs WHERE id = ?")
    .bind(id)
    .first<{ id: string; category_id: string | null }>();
  if (current === null) {
    return false;
  }
  const nextCategory =
    patch.categoryId !== undefined ? patch.categoryId : current.category_id;
  if (patch.categoryId !== undefined && patch.categoryId !== null) {
    const category = await db
      .prepare("SELECT id FROM categories WHERE id = ?")
      .bind(patch.categoryId)
      .first();
    if (category === null) {
      throw new Error("大分類が見つかりません");
    }
  }
  if (patch.subcategoryIds !== undefined) {
    await assertSubcategoriesInCategory(db, nextCategory, patch.subcategoryIds);
  }
  const assignments: string[] = ["updated_at = ?"];
  const values: (string | null)[] = [now];
  if (patch.status !== undefined) {
    assignments.push("status = ?", "status_by = 'user'");
    values.push(patch.status);
  }
  if (patch.reason !== undefined) {
    assignments.push("reason = ?", "reason_by = ?");
    values.push(patch.reason, patch.reason === null ? null : "user");
  }
  if (patch.categoryId !== undefined || patch.subcategoryIds !== undefined) {
    assignments.push("category_id = ?", "classified_by = 'user'");
    values.push(nextCategory);
  }
  const statements: D1PreparedStatement[] = [
    db
      .prepare(`UPDATE techs SET ${assignments.join(", ")} WHERE id = ?`)
      .bind(...values, id),
  ];
  if (patch.categoryId !== undefined || patch.subcategoryIds !== undefined) {
    statements.push(
      db.prepare("DELETE FROM tech_subcategories WHERE tech_id = ?").bind(id),
    );
    const subcategoryIds = patch.subcategoryIds ?? [];
    for (const subcategoryId of subcategoryIds) {
      statements.push(
        db
          .prepare(
            `INSERT INTO tech_subcategories (tech_id, subcategory_id)
             VALUES (?, ?)`,
          )
          .bind(id, subcategoryId),
      );
    }
  }
  if (patch.tags !== undefined) {
    const tagIds: string[] = [];
    for (const tag of patch.tags) {
      if (tag.name.trim().length === 0) {
        continue;
      }
      tagIds.push(await upsertTag(db, tag));
    }
    statements.push(
      db
        .prepare("DELETE FROM tech_tags WHERE tech_id = ? AND source = 'user'")
        .bind(id),
    );
    for (const tagId of tagIds) {
      statements.push(
        db
          .prepare(
            `INSERT INTO tech_tags (tech_id, tag_id, source)
             VALUES (?, ?, 'user')
             ON CONFLICT(tech_id, tag_id) DO NOTHING`,
          )
          .bind(id, tagId),
      );
    }
  }
  await db.batch(statements);
  return true;
}

async function assertSubcategoriesInCategory(
  db: D1Database,
  categoryId: string | null,
  subcategoryIds: readonly string[],
): Promise<void> {
  if (subcategoryIds.length === 0) {
    return;
  }
  if (categoryId === null) {
    throw new Error("小分類を付ける大分類がありません");
  }
  const marks = subcategoryIds.map(() => "?").join(", ");
  const found = await db
    .prepare(
      `SELECT id, category_id FROM subcategories WHERE id IN (${marks})`,
    )
    .bind(...subcategoryIds)
    .all<{ id: string; category_id: string }>();
  if (found.results.length !== new Set(subcategoryIds).size) {
    throw new Error("小分類が見つかりません");
  }
  if (found.results.some((row) => row.category_id !== categoryId)) {
    throw new Error("小分類がこの大分類に属しません");
  }
}

export async function loadSubcategoryComparison(db: D1Database, id: string) {
  const subcategory = await db
    .prepare(
      `SELECT s.id, s.name, c.name AS category_name
       FROM subcategories s
       JOIN categories c ON c.id = s.category_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<{ id: string; name: string; category_name: string }>();
  if (subcategory === null) {
    return null;
  }
  const techs = await db
    .prepare(
      `SELECT t.id, t.name, t.status, t.reason, t.updated_at,
              (SELECT COUNT(*) FROM memo_techs mt WHERE mt.tech_id = t.id) AS memo_count
       FROM techs t
       JOIN tech_subcategories ts ON ts.tech_id = t.id
       WHERE ts.subcategory_id = ?
       ORDER BY t.name`,
    )
    .bind(id)
    .all<{
      id: string;
      name: string;
      status: TechStatus;
      reason: string | null;
      updated_at: string;
      memo_count: number;
    }>();
  return {
    id: subcategory.id,
    name: subcategory.name,
    categoryName: subcategory.category_name,
    techs: techs.results.map((tech) => ({
      id: tech.id,
      name: tech.name,
      status: tech.status,
      reason: tech.reason,
      updatedAt: tech.updated_at,
      memoCount: tech.memo_count,
    })),
  };
}
