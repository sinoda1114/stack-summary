import { isTechStatus, TECH_STATUS_LABELS } from "../../shared/labels";

const CATALOG_LIMIT = 60;
const TITLE_LIMIT = 30;
const SUBCATEGORY_LIMIT = 40;
const MATCH_LIMIT = 4;
const TOKEN_LIMIT = 6;
const BODY_LIMIT = 600;
const REASON_LIMIT = 200;
const EVIDENCE_LIMIT = 8000;

const SKIPPED_TOKENS = new Set([
  "これ",
  "それ",
  "あれ",
  "メモ",
  "技術",
  "使い方",
  "アプリ",
  "画面",
  "について",
  "どう",
  "なに",
  "何",
  "教え",
  "ください",
  "です",
  "ます",
]);

type TechHit = {
  name: string;
  status: string;
  reason: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  aliases: string[];
};

type MemoHit = {
  id: string;
  title: string;
  body: string;
  techs: string[];
};

export function questionTokens(question: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    const token = value.trim();
    const key = token.toLocaleLowerCase();
    if (token.length < 2 || token.length > 40 || seen.has(key) || SKIPPED_TOKENS.has(key)) {
      return;
    }
    seen.add(key);
    found.push(token);
  };
  for (const match of question.matchAll(/[A-Za-z0-9][A-Za-z0-9.+#_-]{1,39}/g)) {
    const token = match[0];
    if (token !== undefined) {
      add(token);
    }
  }
  for (const part of question.split(/[\s、。！？!?，,.・/／「」『』（）()【】[\]"'`：:]+/u)) {
    add(part);
  }
  return found.slice(0, TOKEN_LIMIT);
}

export async function loadChatEvidence(db: D1Database, question: string): Promise<string> {
  const tokens = questionTokens(question);
  const [memoCount, techCount, categories, subcategories, catalog, titles, hits] =
    await Promise.all([
      countRows(db, "memos"),
      countRows(db, "techs"),
      listCategories(db),
      listSubcategories(db),
      listCatalog(db),
      listMemoTitles(db),
      findHits(db, tokens),
    ]);
  const text = [
    `件数: メモ ${memoCount}、技術 ${techCount}`,
    `大分類: ${categories.length === 0 ? "なし" : categories.join("、")}`,
    `小分類: ${subcategories.length === 0 ? "なし" : subcategories.join("、")}`,
    "技術一覧:",
    catalog.length === 0 ? "なし" : catalog.map((tech) => `- ${formatTech(tech, false)}`).join("\n"),
    "メモ一覧:",
    titles.length === 0 ? "なし" : titles.map((title) => `- ${title}`).join("\n"),
    "一致した技術:",
    hits.techs.length === 0
      ? "なし"
      : hits.techs.map((tech) => `- ${formatTech(tech, true)}`).join("\n"),
    "一致したメモ:",
    hits.memos.length === 0 ? "なし" : hits.memos.map((memo) => formatMemo(memo)).join("\n"),
  ].join("\n");
  return text.length <= EVIDENCE_LIMIT ? text : `${text.slice(0, EVIDENCE_LIMIT)}…`;
}

async function countRows(db: D1Database, table: "memos" | "techs"): Promise<number> {
  const row = await db.prepare(countSql(table)).first<{ n: number }>();
  return row?.n ?? 0;
}

function countSql(table: "memos" | "techs"): string {
  switch (table) {
    case "memos":
      return "SELECT COUNT(*) AS n FROM memos";
    case "techs":
      return "SELECT COUNT(*) AS n FROM techs";
    default: {
      const neverTable: never = table;
      return neverTable;
    }
  }
}

async function listCategories(db: D1Database): Promise<string[]> {
  const listed = await db
    .prepare("SELECT name FROM categories ORDER BY sort_order")
    .all<{ name: string }>();
  return listed.results.map((row) => row.name);
}

async function listSubcategories(db: D1Database): Promise<string[]> {
  const listed = await db
    .prepare(
      `SELECT c.name AS category_name, s.name AS subcategory_name
       FROM subcategories s
       JOIN categories c ON c.id = s.category_id
       ORDER BY c.sort_order, s.sort_order, s.name
       LIMIT ?`,
    )
    .bind(SUBCATEGORY_LIMIT)
    .all<{ category_name: string; subcategory_name: string }>();
  return listed.results.map((row) => `${row.category_name} / ${row.subcategory_name}`);
}

async function listCatalog(db: D1Database): Promise<TechHit[]> {
  const listed = await db
    .prepare(
      `SELECT t.name, t.status, c.name AS category_name, s.name AS subcategory_name
       FROM techs t
       LEFT JOIN subcategories s ON s.id = t.subcategory_id
       LEFT JOIN categories c ON c.id = s.category_id
       ORDER BY t.name
       LIMIT ?`,
    )
    .bind(CATALOG_LIMIT)
    .all<{
      name: string;
      status: string;
      category_name: string | null;
      subcategory_name: string | null;
    }>();
  return listed.results.map((row) => ({
    name: row.name,
    status: row.status,
    reason: null,
    categoryName: row.category_name,
    subcategoryName: row.subcategory_name,
    aliases: [],
  }));
}

async function listMemoTitles(db: D1Database): Promise<string[]> {
  const listed = await db
    .prepare("SELECT title FROM memos ORDER BY created_at DESC, id DESC LIMIT ?")
    .bind(TITLE_LIMIT)
    .all<{ title: string }>();
  return listed.results.map((row) => row.title);
}

async function findHits(
  db: D1Database,
  tokens: string[],
): Promise<{ techs: TechHit[]; memos: MemoHit[] }> {
  const techs: TechHit[] = [];
  const memos: MemoHit[] = [];
  const techNames = new Set<string>();
  const memoIds = new Set<string>();
  for (const token of tokens) {
    if (techs.length < MATCH_LIMIT) {
      for (const tech of await matchTechs(db, token, MATCH_LIMIT)) {
        const key = tech.name.toLocaleLowerCase();
        if (techNames.has(key) || techs.length >= MATCH_LIMIT) {
          continue;
        }
        techNames.add(key);
        techs.push(tech);
      }
    }
    if (memos.length < MATCH_LIMIT) {
      for (const memo of await matchMemos(db, token, MATCH_LIMIT)) {
        if (memoIds.has(memo.id) || memos.length >= MATCH_LIMIT) {
          continue;
        }
        memoIds.add(memo.id);
        memos.push(memo);
      }
    }
  }
  return { techs, memos };
}

async function matchTechs(db: D1Database, token: string, limit: number): Promise<TechHit[]> {
  const listed = await db
    .prepare(
      `SELECT t.id, t.name, t.status, t.reason, c.name AS category_name, s.name AS subcategory_name
       FROM techs t
       LEFT JOIN subcategories s ON s.id = t.subcategory_id
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE instr(lower(t.name), lower(?)) > 0
          OR instr(lower(COALESCE(t.reason, '')), lower(?)) > 0
          OR EXISTS (
            SELECT 1 FROM tech_aliases a
            WHERE a.tech_id = t.id AND instr(lower(a.alias), lower(?)) > 0
          )
       ORDER BY t.name
       LIMIT ?`,
    )
    .bind(token, token, token, limit)
    .all<{
      id: string;
      name: string;
      status: string;
      reason: string | null;
      category_name: string | null;
      subcategory_name: string | null;
    }>();
  const aliases = await aliasesByTech(db, listed.results.map((row) => row.id));
  return listed.results.map((row) => ({
    name: row.name,
    status: row.status,
    reason: row.reason,
    categoryName: row.category_name,
    subcategoryName: row.subcategory_name,
    aliases: aliases.get(row.id) ?? [],
  }));
}

async function aliasesByTech(db: D1Database, techIds: string[]): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (techIds.length === 0) {
    return grouped;
  }
  const placeholders = techIds.map(() => "?").join(", ");
  const listed = await db
    .prepare(
      `SELECT tech_id, alias FROM tech_aliases
       WHERE tech_id IN (${placeholders})
       ORDER BY alias`,
    )
    .bind(...techIds)
    .all<{ tech_id: string; alias: string }>();
  for (const row of listed.results) {
    const current = grouped.get(row.tech_id) ?? [];
    if (current.length < 5) {
      current.push(row.alias);
      grouped.set(row.tech_id, current);
    }
  }
  return grouped;
}

async function matchMemos(db: D1Database, token: string, limit: number): Promise<MemoHit[]> {
  const listed = await db
    .prepare(
      `SELECT id, title, body
       FROM memos
       WHERE instr(lower(title), lower(?)) > 0 OR instr(lower(body), lower(?)) > 0
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(token, token, limit)
    .all<{ id: string; title: string; body: string }>();
  const techs = await techNamesByMemo(db, listed.results.map((row) => row.id));
  return listed.results.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    techs: techs.get(row.id) ?? [],
  }));
}

async function techNamesByMemo(db: D1Database, memoIds: string[]): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (memoIds.length === 0) {
    return grouped;
  }
  const placeholders = memoIds.map(() => "?").join(", ");
  const listed = await db
    .prepare(
      `SELECT mt.memo_id, t.name
       FROM memo_techs mt
       JOIN techs t ON t.id = mt.tech_id
       WHERE mt.memo_id IN (${placeholders})
       ORDER BY t.name`,
    )
    .bind(...memoIds)
    .all<{ memo_id: string; name: string }>();
  for (const row of listed.results) {
    const current = grouped.get(row.memo_id) ?? [];
    if (current.length < 8) {
      current.push(row.name);
      grouped.set(row.memo_id, current);
    }
  }
  return grouped;
}

function formatTech(tech: TechHit, withReason: boolean): string {
  const place =
    tech.categoryName === null
      ? "未分類"
      : `${tech.categoryName} / ${tech.subcategoryName ?? "未分類"}`;
  const parts = [tech.name, place, statusLabel(tech.status)];
  if (withReason) {
    parts.push(tech.reason === null ? "理由: なし" : `理由: ${clip(tech.reason, REASON_LIMIT)}`);
    if (tech.aliases.length > 0) {
      parts.push(`別名: ${tech.aliases.join("、")}`);
    }
  }
  return parts.join(" | ");
}

function formatMemo(memo: MemoHit): string {
  const techs = memo.techs.length === 0 ? "なし" : memo.techs.join("、");
  return `- ${memo.title}\n  本文: ${clip(memo.body, BODY_LIMIT)}\n  技術: ${techs}`;
}

function statusLabel(status: string): string {
  if (!isTechStatus(status)) {
    return status;
  }
  return TECH_STATUS_LABELS[status];
}

function clip(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…`;
}
