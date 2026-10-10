import type { TechStatus } from "../../shared/labels";

export type InboxTech = {
  id: string;
  name: string;
  status: TechStatus;
  categoryId: string | null;
  updatedAt: string;
};

export async function listUnratedTechs(db: D1Database): Promise<InboxTech[]> {
  return listInbox(
    db,
    `SELECT id, name, status, category_id, updated_at
     FROM techs
     WHERE status = 'unrated'
     ORDER BY updated_at, name`,
  );
}

export async function listUnclassifiedTechs(db: D1Database): Promise<InboxTech[]> {
  return listInbox(
    db,
    `SELECT id, name, status, category_id, updated_at
     FROM techs
     WHERE category_id IS NULL
     ORDER BY updated_at, name`,
  );
}

async function listInbox(db: D1Database, sql: string): Promise<InboxTech[]> {
  const listed = await db.prepare(sql).all<{
    id: string;
    name: string;
    status: TechStatus;
    category_id: string | null;
    updated_at: string;
  }>();
  return listed.results.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    categoryId: row.category_id,
    updatedAt: row.updated_at,
  }));
}

export type UnreviewedSubcategory = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
};

export async function listUnreviewedSubcategories(
  db: D1Database,
): Promise<UnreviewedSubcategory[]> {
  const listed = await db
    .prepare(
      `SELECT s.id, s.name, s.category_id, c.name AS category_name
       FROM subcategories s
       JOIN categories c ON c.id = s.category_id
       WHERE s.created_by = 'ai' AND s.reviewed = 0
       ORDER BY c.sort_order, s.name`,
    )
    .all<{ id: string; name: string; category_id: string; category_name: string }>();
  return listed.results.map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
  }));
}
