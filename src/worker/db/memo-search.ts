import { tagNameKey } from "./tags";

export type MemoListItem = {
  id: string;
  title: string;
  memoDate: string | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

export type MemoSearchPage = {
  memos: MemoListItem[];
  nextCursor: string | null;
};

export function parseMemoSearchCursor(value: string): string | null {
  const parts = value.split("|");
  if (parts.length !== 4) {
    return null;
  }
  const flag = parts[0];
  const memoDate = parts[1];
  const createdAt = parts[2];
  const id = parts[3];
  if (
    (flag !== "0" && flag !== "1") ||
    memoDate === undefined ||
    createdAt === undefined ||
    createdAt.length === 0 ||
    id === undefined ||
    id.length === 0
  ) {
    return null;
  }
  if (flag === "0" && memoDate !== "") {
    return null;
  }
  if (flag === "1" && !/^\d{4}-\d{2}-\d{2}$/.test(memoDate)) {
    return null;
  }
  return `${flag}|${memoDate}|${createdAt}|${id}`;
}

function memoSortKey(memoDate: string | null, createdAt: string, id: string): string {
  return `${memoDate === null ? "0" : "1"}|${memoDate ?? ""}|${createdAt}|${id}`;
}

export async function searchMemos(
  db: D1Database,
  input: { q: string; tag: string; cursor?: string | null },
): Promise<MemoSearchPage> {
  const q = input.q.trim();
  const tag = input.tag.trim();
  const tagKey = tagNameKey(tag);
  const cursor = input.cursor ?? "";
  const listed = await db
    .prepare(
      `SELECT m.id, m.title, m.memo_date, m.created_at
       FROM memos m
       WHERE (instr(lower(m.title), lower(?)) > 0 OR instr(lower(m.body), lower(?)) > 0)
         AND (
           ? = '' OR EXISTS (
             SELECT 1 FROM memo_tags mt
             JOIN tags t ON t.id = mt.tag_id
             WHERE mt.memo_id = m.id AND (t.name = ? OR t.name_key = ?)
           )
         )
         AND (? = '' OR (
           (CASE WHEN m.memo_date IS NULL THEN '0' ELSE '1' END)
           || '|' || COALESCE(m.memo_date, '')
           || '|' || m.created_at
           || '|' || m.id
         ) < ?)
       ORDER BY
         (CASE WHEN m.memo_date IS NULL THEN '0' ELSE '1' END)
         || '|' || COALESCE(m.memo_date, '')
         || '|' || m.created_at
         || '|' || m.id DESC
       LIMIT ?`,
    )
    .bind(q, q, tag, tag, tagKey, cursor, cursor, PAGE_SIZE + 1)
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
      ? memoSortKey(last.memoDate, last.createdAt, last.id)
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

