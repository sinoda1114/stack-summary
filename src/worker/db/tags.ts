export type TagKind = "topic" | "vendor" | "project";

export function tagDisplayName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\p{White_Space}+/gu, " ");
}

export function tagNameKey(name: string): string | null {
  const key = tagDisplayName(name).toLowerCase();
  return key.length === 0 ? null : key;
}

export async function upsertTag(
  db: D1Database,
  input: { name: string; kind: TagKind },
): Promise<string> {
  const display = tagDisplayName(input.name);
  const key = tagNameKey(input.name);
  if (key === null) {
    throw new Error("タグ名が空です");
  }
  const existing = await findTag(db, input.kind, key);
  if (existing !== null) {
    return existing;
  }
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO tags (id, name, kind, name_key)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(id, display, input.kind, key)
      .run();
    return id;
  } catch (error) {
    if (!isUnique(error)) {
      throw error;
    }
  }
  const raced = await findTag(db, input.kind, key);
  if (raced === null) {
    throw new Error("タグを保存できませんでした");
  }
  return raced;
}

async function findTag(
  db: D1Database,
  kind: TagKind,
  key: string,
): Promise<string | null> {
  const listed = await db
    .prepare(
      `SELECT id, name, name_key FROM tags
       WHERE kind = ?
       ORDER BY name_key IS NULL, name`,
    )
    .bind(kind)
    .all<{ id: string; name: string; name_key: string | null }>();
  const match = listed.results.find(
    (row) => row.name_key === key || tagNameKey(row.name) === key,
  );
  if (match === undefined) {
    return null;
  }
  if (match.name_key !== key) {
    try {
      await db
        .prepare("UPDATE tags SET name_key = ? WHERE id = ? AND name_key IS NULL")
        .bind(key, match.id)
        .run();
    } catch (error) {
      if (!isUnique(error)) {
        throw error;
      }
    }
  }
  return match.id;
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("unique");
}
