export type CategoryRow = { id: string; name: string };

export type SubcategoryRow = {
  id: string;
  categoryId: string;
  name: string;
  examples: string[];
};

export async function listCategories(db: D1Database): Promise<CategoryRow[]> {
  const listed = await db
    .prepare("SELECT id, name FROM categories ORDER BY sort_order")
    .all<{ id: string; name: string }>();
  return listed.results;
}

export async function listSubcategories(
  db: D1Database,
): Promise<SubcategoryRow[]> {
  const listed = await db
    .prepare(
      `SELECT id, category_id, name
       FROM subcategories
       ORDER BY sort_order, name`,
    )
    .all<{ id: string; category_id: string; name: string }>();
  const rows: SubcategoryRow[] = [];
  for (const row of listed.results) {
    const examples = await db
      .prepare(
        `SELECT name FROM techs
         WHERE subcategory_id = ?
         ORDER BY name
         LIMIT 5`,
      )
      .bind(row.id)
      .all<{ name: string }>();
    rows.push({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      examples: examples.results.map((example) => example.name),
    });
  }
  return rows;
}

export async function upsertAiSubcategory(
  db: D1Database,
  input: { categoryId: string; name: string; now: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const sort = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next
       FROM subcategories
       WHERE category_id = ?`,
    )
    .bind(input.categoryId)
    .first<{ next: number }>();
  await db
    .prepare(
      `INSERT INTO subcategories (
         id, category_id, name, sort_order, created_by, reviewed, created_at
       ) VALUES (?, ?, ?, ?, 'ai', 0, ?)
       ON CONFLICT(category_id, name) DO NOTHING`,
    )
    .bind(id, input.categoryId, input.name, sort?.next ?? 1, input.now)
    .run();
  const row = await db
    .prepare(
      "SELECT id FROM subcategories WHERE category_id = ? AND name = ?",
    )
    .bind(input.categoryId, input.name)
    .first<{ id: string }>();
  if (row === null) {
    throw new Error("小分類を保存できませんでした");
  }
  return row.id;
}

export async function classifyTechRow(
  db: D1Database,
  input: {
    techId: string;
    subcategoryId: string | null;
    classifiedBy: "model" | null;
    promptVersion: string;
    now: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE techs
       SET subcategory_id = ?,
           classified_by = ?,
           prompt_version = ?,
           updated_at = ?
       WHERE id = ?
         AND (classified_by IS NULL OR classified_by <> 'user')`,
    )
    .bind(
      input.subcategoryId,
      input.classifiedBy,
      input.promptVersion,
      input.now,
      input.techId,
    )
    .run();
}
