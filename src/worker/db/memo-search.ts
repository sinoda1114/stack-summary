export type MemoListItem = {
  id: string;
  title: string;
  memoDate: string | null;
  createdAt: string;
};

export async function searchMemos(
  db: D1Database,
  input: { q: string; tag: string },
): Promise<MemoListItem[]> {
  const q = input.q.trim();
  const tag = input.tag.trim();
  const like = `%${escapeLike(q)}%`;
  const listed = await db
    .prepare(
      `SELECT m.id, m.title, m.memo_date, m.created_at
       FROM memos m
       WHERE (? = '' OR m.title LIKE ? ESCAPE '\\' OR m.body LIKE ? ESCAPE '\\')
         AND (
           ? = '' OR EXISTS (
             SELECT 1 FROM memo_tags mt
             JOIN tags t ON t.id = mt.tag_id
             WHERE mt.memo_id = m.id AND t.name = ?
           )
         )
       ORDER BY m.memo_date IS NULL, m.memo_date DESC, m.created_at DESC
       LIMIT 50`,
    )
    .bind(q, like, like, tag, tag)
    .all<{ id: string; title: string; memo_date: string | null; created_at: string }>();
  return listed.results.map((row) => ({
    id: row.id,
    title: row.title,
    memoDate: row.memo_date,
    createdAt: row.created_at,
  }));
}

export type MemoDetail = {
  id: string;
  title: string;
  body: string;
  memoDate: string | null;
  techs: { id: string; name: string; relation: "subject" | "comparison" }[];
  mentions: { name: string }[];
  similars: { id: string; title: string }[];
};

export async function loadMemoDetail(
  db: D1Database,
  id: string,
): Promise<MemoDetail | null> {
  const memo = await db
    .prepare("SELECT id, title, body, memo_date FROM memos WHERE id = ?")
    .bind(id)
    .first<{ id: string; title: string; body: string; memo_date: string | null }>();
  if (memo === null) {
    return null;
  }
  const techs = await db
    .prepare(
      `SELECT t.id, t.name, mt.relation
       FROM memo_techs mt
       JOIN techs t ON t.id = mt.tech_id
       WHERE mt.memo_id = ?
       ORDER BY t.name`,
    )
    .bind(id)
    .all<{ id: string; name: string; relation: "subject" | "comparison" }>();
  const mentions = await db
    .prepare("SELECT name FROM memo_mentions WHERE memo_id = ? ORDER BY name")
    .bind(id)
    .all<{ name: string }>();
  const similars = await db
    .prepare(
      `SELECT m.id, m.title
       FROM memo_similars s
       JOIN memos m ON m.id = s.similar_memo_id
       WHERE s.memo_id = ?
       ORDER BY m.title`,
    )
    .bind(id)
    .all<{ id: string; title: string }>();
  return {
    id: memo.id,
    title: memo.title,
    body: memo.body,
    memoDate: memo.memo_date,
    techs: techs.results,
    mentions: mentions.results,
    similars: similars.results,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
