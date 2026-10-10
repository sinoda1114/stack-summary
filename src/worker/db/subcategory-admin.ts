export type SubcategoryChoice = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
};

export async function listSubcategoryChoices(
  db: D1Database,
): Promise<SubcategoryChoice[]> {
  const listed = await db
    .prepare(
      `SELECT s.id, s.name, s.category_id, c.name AS category_name
       FROM subcategories s
       JOIN categories c ON c.id = s.category_id
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

export async function createUserSubcategory(
  db: D1Database,
  input: { categoryId: string; name: string; now: string },
): Promise<{ ok: true; id: string } | { ok: false; code: "invalid" | "not_found" | "name_taken" }> {
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, code: "invalid" };
  }
  const category = await db
    .prepare("SELECT id FROM categories WHERE id = ?")
    .bind(input.categoryId)
    .first();
  if (category === null) {
    return { ok: false, code: "not_found" };
  }
  const sort = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next
       FROM subcategories WHERE category_id = ?`,
    )
    .bind(input.categoryId)
    .first<{ next: number }>();
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO subcategories (
           id, category_id, name, sort_order, created_by, reviewed, created_at
         ) VALUES (?, ?, ?, ?, 'user', 1, ?)`,
      )
      .bind(id, input.categoryId, name, sort?.next ?? 1, input.now)
      .run();
  } catch (error) {
    if (isUnique(error)) {
      return { ok: false, code: "name_taken" };
    }
    throw error;
  }
  return { ok: true, id };
}

export async function patchSubcategory(
  db: D1Database,
  id: string,
  patch: { name?: string; categoryId?: string; reviewed?: boolean },
): Promise<{ ok: true } | { ok: false; code: "not_found" | "invalid" | "name_taken" }> {
  const current = await db
    .prepare("SELECT id, category_id, name FROM subcategories WHERE id = ?")
    .bind(id)
    .first<{ id: string; category_id: string; name: string }>();
  if (current === null) {
    return { ok: false, code: "not_found" };
  }
  const name = patch.name === undefined ? current.name : patch.name.trim();
  if (name.length === 0) {
    return { ok: false, code: "invalid" };
  }
  const categoryId = patch.categoryId ?? current.category_id;
  if (patch.categoryId !== undefined) {
    const category = await db
      .prepare("SELECT id FROM categories WHERE id = ?")
      .bind(categoryId)
      .first();
    if (category === null) {
      return { ok: false, code: "not_found" };
    }
  }
  const reviewed = patch.reviewed === true ? 1 : null;
  try {
    if (reviewed === null) {
      await db
        .prepare("UPDATE subcategories SET name = ?, category_id = ? WHERE id = ?")
        .bind(name, categoryId, id)
        .run();
    } else {
      await db
        .prepare(
          "UPDATE subcategories SET name = ?, category_id = ?, reviewed = 1 WHERE id = ?",
        )
        .bind(name, categoryId, id)
        .run();
    }
  } catch (error) {
    if (isUnique(error)) {
      return { ok: false, code: "name_taken" };
    }
    throw error;
  }
  return { ok: true };
}

export async function mergeSubcategory(
  db: D1Database,
  input: { sourceId: string; intoId: string; now: string },
): Promise<{ ok: true } | { ok: false; code: "self_merge" | "not_found" }> {
  if (input.sourceId === input.intoId) {
    return { ok: false, code: "self_merge" };
  }
  const into = await db
    .prepare("SELECT id, category_id FROM subcategories WHERE id = ?")
    .bind(input.intoId)
    .first<{ id: string; category_id: string }>();
  const source = await db
    .prepare("SELECT id FROM subcategories WHERE id = ?")
    .bind(input.sourceId)
    .first<{ id: string }>();
  if (into === null || source === null) {
    return { ok: false, code: "not_found" };
  }
  const affected = await db
    .prepare("SELECT tech_id FROM tech_subcategories WHERE subcategory_id = ?")
    .bind(input.sourceId)
    .all<{ tech_id: string }>();
  const techIds = affected.results.map((row) => row.tech_id);
  const statements = subcategoryMergeStatements(db, {
    intoCategoryId: into.category_id,
    techIds,
    now: input.now,
  });
  if (techIds.length > 0) {
    const marks = techIds.map(() => "?").join(", ");
    const foreign = await db
      .prepare(
        `SELECT ts.tech_id, ts.subcategory_id
         FROM tech_subcategories ts
         JOIN subcategories s ON s.id = ts.subcategory_id
         WHERE ts.tech_id IN (${marks})
           AND s.category_id <> ?`,
      )
      .bind(...techIds, into.category_id)
      .all<{ tech_id: string; subcategory_id: string }>();
    for (const row of foreign.results) {
      statements.push(
        db
          .prepare(
            `DELETE FROM tech_subcategories
             WHERE tech_id = ? AND subcategory_id = ?`,
          )
          .bind(row.tech_id, row.subcategory_id),
      );
    }
  }
  const already = await db
    .prepare("SELECT tech_id FROM tech_subcategories WHERE subcategory_id = ?")
    .bind(input.intoId)
    .all<{ tech_id: string }>();
  const intoIds = new Set(already.results.map((row) => row.tech_id));
  for (const techId of techIds) {
    if (!intoIds.has(techId)) {
      continue;
    }
    statements.push(
      db
        .prepare(
          `DELETE FROM tech_subcategories
           WHERE tech_id = ? AND subcategory_id = ?`,
        )
        .bind(techId, input.sourceId),
    );
  }
  statements.push(
    db
      .prepare(
        "UPDATE tech_subcategories SET subcategory_id = ? WHERE subcategory_id = ?",
      )
      .bind(input.intoId, input.sourceId),
    db.prepare("DELETE FROM subcategories WHERE id = ?").bind(input.sourceId),
  );
  await db.batch(statements);
  return { ok: true };
}

function subcategoryMergeStatements(
  db: D1Database,
  input: {
    intoCategoryId: string;
    techIds: readonly string[];
    now: string;
  },
): D1PreparedStatement[] {
  if (input.techIds.length === 0) {
    return [];
  }
  const marks = input.techIds.map(() => "?").join(", ");
  return [
    db
      .prepare(
        `UPDATE techs
         SET category_id = ?, classified_by = 'user', updated_at = ?
         WHERE id IN (${marks})`,
      )
      .bind(input.intoCategoryId, input.now, ...input.techIds),
  ];
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("unique");
}
