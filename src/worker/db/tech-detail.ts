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
  subcategoryId: string | null;
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

export async function loadTechDetail(
  db: D1Database,
  id: string,
): Promise<TechDetail | null> {
  const tech = await db
    .prepare(
      `SELECT id, name, status, status_by, reason, reason_by, subcategory_id, classified_by, updated_at
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
      subcategory_id: string | null;
      classified_by: string | null;
      updated_at: string;
    }>();
  if (tech === null || !isTechStatus(tech.status)) {
    return null;
  }
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
    subcategoryId: tech.subcategory_id,
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
    subcategoryId?: string | null;
    tags?: { name: string; kind: "topic" | "vendor" | "project" }[];
  },
  now: string,
): Promise<boolean> {
  const current = await db
    .prepare("SELECT id FROM techs WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (current === null) {
    return false;
  }
  if (patch.subcategoryId !== undefined && patch.subcategoryId !== null) {
    const subcategory = await db
      .prepare("SELECT id FROM subcategories WHERE id = ?")
      .bind(patch.subcategoryId)
      .first();
    if (subcategory === null) {
      throw new Error("小分類が見つかりません");
    }
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
  if (patch.subcategoryId !== undefined) {
    assignments.push("subcategory_id = ?", "classified_by = 'user'");
    values.push(patch.subcategoryId);
  }
  const statements: D1PreparedStatement[] = [
    db
      .prepare(`UPDATE techs SET ${assignments.join(", ")} WHERE id = ?`)
      .bind(...values, id),
  ];
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
       WHERE t.subcategory_id = ?
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
