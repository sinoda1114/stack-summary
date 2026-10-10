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
  const existing = await findTag(db, input.kind, key, display);
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
  const raced = await findTag(db, input.kind, key, display);
  if (raced === null) {
    throw new Error("タグを保存できませんでした");
  }
  return raced;
}

async function findTag(
  db: D1Database,
  kind: TagKind,
  key: string,
  display: string,
): Promise<string | null> {
  const byKey = await db
    .prepare("SELECT id FROM tags WHERE kind = ? AND name_key = ?")
    .bind(kind, key)
    .first<{ id: string }>();
  if (byKey !== null) {
    return byKey.id;
  }
  const byName = await db
    .prepare("SELECT id, name_key FROM tags WHERE kind = ? AND name = ?")
    .bind(kind, display)
    .first<{ id: string; name_key: string | null }>();
  if (byName === null) {
    return null;
  }
  if (byName.name_key === null) {
    await db
      .prepare("UPDATE tags SET name_key = ? WHERE id = ? AND name_key IS NULL")
      .bind(key, byName.id)
      .run();
  }
  return byName.id;
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("unique");
}
