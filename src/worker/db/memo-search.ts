export type MemoListItem = {
  id: string;
  title: string;
  memoDate: string | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

export type MemoSearchCursor = {
  memoDate: string | null;
  createdAt: string;
  id: string;
};

export type MemoSearchPage = {
  memos: MemoListItem[];
  nextCursor: string | null;
};

export function parseMemoSearchCursor(value: string): MemoSearchCursor | null {
  const parts = value.split("|");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return null;
  }
  const memoDate = parts[1];
  const createdAt = parts[2];
  const id = parts[3];
  if (
    memoDate === undefined ||
    createdAt === undefined ||
    createdAt.length === 0 ||
    id === undefined ||
    id.length === 0
  ) {
    return null;
  }
  if (memoDate === "") {
    return { memoDate: null, createdAt, id };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(memoDate)) {
    return null;
  }
  return { memoDate, createdAt, id };
}

export async function searchMemos(
  db: D1Database,
  input: { q: string; tag: string; cursor?: string | null },
): Promise<MemoSearchPage> {
  const q = input.q.trim();
  const tag = input.tag.trim();
  const cursor =
    input.cursor === undefined || input.cursor === null || input.cursor.length === 0
      ? null
      : parseMemoSearchCursor(input.cursor);
  const listed = await db
    .prepare(
      `SELECT m.id, m.title, m.memo_date, m.created_at
       FROM memos m
       WHERE (instr(lower(m.title), lower(?)) > 0 OR instr(lower(m.body), lower(?)) > 0)
         AND (
           ? = '' OR EXISTS (
             SELECT 1 FROM memo_tags mt
             JOIN tags t ON t.id = mt.tag_id
             WHERE mt.memo_id = m.id AND t.name = ?
           )
         )
         AND (
           ? = 1
           OR (
             ? IS NOT NULL
             AND (
               m.memo_date IS NULL
               OR m.memo_date < ?
               OR (
                 m.memo_date = ?
                 AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
               )
             )
           )
           OR (
             ? IS NULL
             AND m.memo_date IS NULL
             AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
           )
         )
       ORDER BY m.memo_date IS NULL, m.memo_date DESC, m.created_at DESC, m.id DESC
       LIMIT ?`,
    )
    .bind(
      q,
      q,
      tag,
      tag,
      cursor === null ? 1 : 0,
      cursor?.memoDate ?? null,
      cursor?.memoDate ?? null,
      cursor?.memoDate ?? null,
      cursor?.createdAt ?? null,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      cursor?.memoDate ?? null,
      cursor?.createdAt ?? null,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      PAGE_SIZE + 1,
    )
    .all<{ id: string; title: string; memo_date: string | null; created_at: string }>();
  const page = listed.results.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    title: row.title,
    memoDate: row.memo_date,
    createdAt: row.created_at,
  }));
  const last = page.at(-1);
  const nextCursor =
    listed.results.length > PAGE_SIZE && last !== undefined
      ? `v1|${last.memoDate ?? ""}|${last.createdAt}|${last.id}`
      : null;
  return { memos: page, nextCursor };
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

