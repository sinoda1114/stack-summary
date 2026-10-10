export async function upsertTag(
  db: D1Database,
  input: { name: string; kind: "topic" | "vendor" | "project" },
): Promise<string> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("タグ名が空です");
  }
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO tags (id, name, kind)
       VALUES (?, ?, ?)
       ON CONFLICT(kind, name) DO NOTHING`,
    )
    .bind(id, name, input.kind)
    .run();
  const row = await db
    .prepare("SELECT id FROM tags WHERE kind = ? AND name = ?")
    .bind(input.kind, name)
    .first<{ id: string }>();
  if (row === null) {
    throw new Error("タグを保存できませんでした");
  }
  return row.id;
}
