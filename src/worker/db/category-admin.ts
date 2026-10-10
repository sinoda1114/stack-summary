export type CategoryItem = {
  id: string;
  name: string;
  sortOrder: number;
};

export async function listCategoryItems(db: D1Database): Promise<CategoryItem[]> {
  const listed = await db
    .prepare("SELECT id, name, sort_order FROM categories ORDER BY sort_order, name")
    .all<{ id: string; name: string; sort_order: number }>();
  return listed.results.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  }));
}

export async function createCategory(
  db: D1Database,
  input: { name: string; now: string },
): Promise<{ ok: true; id: string } | { ok: false; code: "invalid" | "name_taken" }> {
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, code: "invalid" };
  }
  const sort = await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories")
    .first<{ next: number }>();
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        "INSERT INTO categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(id, name, sort?.next ?? 1, input.now)
      .run();
  } catch (error) {
    if (isUnique(error)) {
      return { ok: false, code: "name_taken" };
    }
    throw error;
  }
  return { ok: true, id };
}

export async function patchCategory(
  db: D1Database,
  id: string,
  patch: { name?: string; sortOrder?: number },
): Promise<{ ok: true } | { ok: false; code: "not_found" | "invalid" | "name_taken" }> {
  const current = await db
    .prepare("SELECT id FROM categories WHERE id = ?")
    .bind(id)
    .first();
  if (current === null) {
    return { ok: false, code: "not_found" };
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0) {
      return { ok: false, code: "invalid" };
    }
    try {
      await db.prepare("UPDATE categories SET name = ? WHERE id = ?").bind(name, id).run();
    } catch (error) {
      if (isUnique(error)) {
        return { ok: false, code: "name_taken" };
      }
      throw error;
    }
  }
  if (patch.sortOrder !== undefined) {
    await db
      .prepare("UPDATE categories SET sort_order = ? WHERE id = ?")
      .bind(patch.sortOrder, id)
      .run();
  }
  return { ok: true };
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("unique");
}
