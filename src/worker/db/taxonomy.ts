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
        `SELECT t.name
         FROM tech_subcategories ts
         JOIN techs t ON t.id = ts.tech_id
         WHERE ts.subcategory_id = ?
         ORDER BY t.name
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
    categoryId: string | null;
    subcategoryIds: readonly string[];
    classifiedBy: "model" | null;
    promptVersion: string;
    now: string;
  },
): Promise<void> {
  const current = await db
    .prepare("SELECT classified_by FROM techs WHERE id = ?")
    .bind(input.techId)
    .first<{ classified_by: string | null }>();
  if (current === null || current.classified_by === "user") {
    return;
  }
  const subcategoryIds = await subcategoryIdsInCategory(
    db,
    input.categoryId,
    input.subcategoryIds,
  );
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE techs
         SET category_id = ?,
             classified_by = ?,
             prompt_version = ?,
             updated_at = ?
         WHERE id = ?
           AND (classified_by IS NULL OR classified_by <> 'user')`,
      )
      .bind(
        input.categoryId,
        input.classifiedBy,
        input.promptVersion,
        input.now,
        input.techId,
      ),
    db
      .prepare(
        `DELETE FROM tech_subcategories
         WHERE tech_id = ?
           AND EXISTS (
             SELECT 1 FROM techs
             WHERE id = ?
               AND (classified_by IS NULL OR classified_by <> 'user')
           )`,
      )
      .bind(input.techId, input.techId),
  ];
  for (const subcategoryId of subcategoryIds) {
    statements.push(
      db
        .prepare(
          `INSERT INTO tech_subcategories (tech_id, subcategory_id)
           SELECT ?, ?
           WHERE EXISTS (
             SELECT 1 FROM techs
             WHERE id = ?
               AND (classified_by IS NULL OR classified_by <> 'user')
           )`,
        )
        .bind(input.techId, subcategoryId, input.techId),
    );
  }
  await db.batch(statements);
}

async function subcategoryIdsInCategory(
  db: D1Database,
  categoryId: string | null,
  subcategoryIds: readonly string[],
): Promise<string[]> {
  if (categoryId === null || subcategoryIds.length === 0) {
    return [];
  }
  const marks = subcategoryIds.map(() => "?").join(", ");
  const found = await db
    .prepare(
      `SELECT id FROM subcategories
       WHERE category_id = ? AND id IN (${marks})`,
    )
    .bind(categoryId, ...subcategoryIds)
    .all<{ id: string }>();
  const allowed = new Set(found.results.map((row) => row.id));
  return subcategoryIds.filter((id) => allowed.has(id));
}
