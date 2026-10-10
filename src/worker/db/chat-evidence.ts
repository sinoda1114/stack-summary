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
  return found
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .slice(0, TOKEN_LIMIT);
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
  const matched = [
    "一致した技術:",
    hits.techs.length === 0 ? "なし" : hits.techs.map((tech) => `- ${formatTech(tech)}`).join("\n"),
    "一致したメモ:",
    hits.memos.length === 0 ? "なし" : hits.memos.map((memo) => formatMemo(memo)).join("\n"),
  ].join("\n");
  const catalogText = [
    `件数: メモ ${memoCount}、技術 ${techCount}`,
    `大分類: ${categories.length === 0 ? "なし" : categories.join("、")}`,
    `小分類: ${subcategories.length === 0 ? "なし" : subcategories.join("、")}`,
    "技術一覧:",
    catalog.length === 0 ? "なし" : catalog.map((tech) => `- ${formatCatalog(tech)}`).join("\n"),
    "メモ一覧:",
    titles.length === 0 ? "なし" : titles.map((title) => `- ${title}`).join("\n"),
  ].join("\n");
  return joinEvidence(matched, catalogText);
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
  if (tokens.length === 0) {
    return { techs: [], memos: [] };
  }
  const [techs, memos] = await Promise.all([matchTechs(db, tokens), matchMemos(db, tokens)]);
  return { techs, memos };
}

async function matchTechs(db: D1Database, tokens: string[]): Promise<TechHit[]> {
  const score = tokenScore(tokens, [
    "t.name",
    "COALESCE(t.reason, '')",
    "COALESCE((SELECT group_concat(a.alias, ' ') FROM tech_aliases a WHERE a.tech_id = t.id), '')",
  ]);
  const where = tokenWhere(tokens, [
    "t.name",
    "COALESCE(t.reason, '')",
    "COALESCE((SELECT group_concat(a.alias, ' ') FROM tech_aliases a WHERE a.tech_id = t.id), '')",
  ]);
  const listed = await db
    .prepare(
      `SELECT t.id, t.name, t.status, t.reason, c.name AS category_name, s.name AS subcategory_name,
              (${score.sql}) AS score
       FROM techs t
       LEFT JOIN subcategories s ON s.id = t.subcategory_id
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE ${where.sql}
       ORDER BY score DESC, t.name
       LIMIT ?`,
    )
    .bind(...score.binds, ...where.binds, MATCH_LIMIT)
    .all<{
      id: string;
      name: string;
      status: string;
      reason: string | null;
      category_name: string | null;
      subcategory_name: string | null;
    }>();
  const aliases = await groupedNames(
    db,
    `SELECT tech_id AS owner_id, alias AS label FROM tech_aliases
     WHERE tech_id IN (${listed.results.map(() => "?").join(", ")})
     ORDER BY alias`,
    listed.results.map((row) => row.id),
    5,
  );
  return listed.results.map((row) => ({
    name: row.name,
    status: row.status,
    reason: row.reason,
    categoryName: row.category_name,
    subcategoryName: row.subcategory_name,
    aliases: aliases.get(row.id) ?? [],
  }));
}

async function matchMemos(db: D1Database, tokens: string[]): Promise<MemoHit[]> {
  const score = tokenScore(tokens, ["title", "body"]);
  const where = tokenWhere(tokens, ["title", "body"]);
  const listed = await db
    .prepare(
      `SELECT id, title, body, (${score.sql}) AS score
       FROM memos
       WHERE ${where.sql}
       ORDER BY score DESC, created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(...score.binds, ...where.binds, MATCH_LIMIT)
    .all<{ id: string; title: string; body: string }>();
  const techs = await groupedNames(
    db,
    `SELECT mt.memo_id AS owner_id, t.name AS label
     FROM memo_techs mt
     JOIN techs t ON t.id = mt.tech_id
     WHERE mt.memo_id IN (${listed.results.map(() => "?").join(", ")})
     ORDER BY t.name`,
    listed.results.map((row) => row.id),
    8,
  );
  return listed.results.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    techs: techs.get(row.id) ?? [],
  }));
}

async function groupedNames(
  db: D1Database,
  sql: string,
  ids: string[],
  limit: number,
): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (ids.length === 0) {
    return grouped;
  }
  const listed = await db
    .prepare(sql)
    .bind(...ids)
    .all<{ owner_id: string; label: string }>();
  for (const row of listed.results) {
    const current = grouped.get(row.owner_id) ?? [];
    if (current.length < limit) {
      current.push(row.label);
      grouped.set(row.owner_id, current);
    }
  }
  return grouped;
}

function tokenWhere(tokens: string[], columns: string[]): { sql: string; binds: string[] } {
  const binds: string[] = [];
  const parts = tokens.flatMap((token) =>
    columns.map((column) => {
      binds.push(token);
      return `instr(lower(${column}), lower(?)) > 0`;
    }),
  );
  return { sql: parts.join(" OR "), binds };
}

function tokenScore(tokens: string[], columns: string[]): { sql: string; binds: string[] } {
  const binds: string[] = [];
  const terms = tokens.map((token) => {
    const checks = columns.map((column) => {
      binds.push(token);
      return `instr(lower(${column}), lower(?)) > 0`;
    });
    return `(CASE WHEN ${checks.join(" OR ")} THEN ${token.length} ELSE 0 END)`;
  });
  return { sql: terms.join(" + "), binds };
}

function formatCatalog(tech: TechHit): string {
  return [tech.name, techPlace(tech), statusLabel(tech.status)].join(" | ");
}

function formatTech(tech: TechHit): string {
  const parts = [
    tech.name,
    techPlace(tech),
    statusLabel(tech.status),
    tech.reason === null ? "理由: なし" : `理由: ${clip(tech.reason, REASON_LIMIT)}`,
  ];
  if (tech.aliases.length > 0) {
    parts.push(`別名: ${tech.aliases.join("、")}`);
  }
  return parts.join(" | ");
}

function techPlace(tech: TechHit): string {
  if (tech.categoryName === null) {
    return "未分類";
  }
  return `${tech.categoryName} / ${tech.subcategoryName ?? "未分類"}`;
}

function joinEvidence(matched: string, catalog: string): string {
  const combined = `${matched}\n${catalog}`;
  if (combined.length <= EVIDENCE_LIMIT) {
    return combined;
  }
  const room = EVIDENCE_LIMIT - matched.length - 1;
  if (room < 40) {
    return `${matched}\n一覧は省略`;
  }
  return `${matched}\n${catalog.slice(0, room)}…\n一覧はここで打ち切り`;
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
