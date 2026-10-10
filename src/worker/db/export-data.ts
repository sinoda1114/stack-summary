const TABLES = [
  "imports",
  "memos",
  "memo_urls",
  "memo_similars",
  "categories",
  "subcategories",
  "techs",
  "tech_aliases",
  "tech_subcategories",
  "tech_relations",
  "memo_techs",
  "memo_mentions",
  "tags",
  "tech_tags",
  "memo_tags",
] as const;

export type ExportTable = (typeof TABLES)[number];

export type ExportBundle = Record<ExportTable, Record<string, unknown>[]>;

export async function loadExportBundle(db: D1Database): Promise<ExportBundle> {
  const bundle = {} as ExportBundle;
  for (const table of TABLES) {
    const listed = await db.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
    bundle[table] = listed.results;
  }
  return bundle;
}

export function exportMarkdown(bundle: ExportBundle): string {
  const parts: string[] = ["# 書き出し", ""];
  for (const table of TABLES) {
    parts.push(`## ${table}`, "");
    const rows = bundle[table];
    if (rows.length === 0) {
      parts.push("（行なし）", "");
      continue;
    }
    for (const row of rows) {
      parts.push(`- ${JSON.stringify(row)}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

export function parseExportMarkdown(markdown: string): ExportBundle {
  const bundle = emptyBundle();
  let table: ExportTable | null = null;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      const name = line.slice(3);
      table = isExportTable(name) ? name : null;
      continue;
    }
    if (table === null || !line.startsWith("- ")) {
      continue;
    }
    const value: unknown = JSON.parse(line.slice(2));
    if (isRow(value)) {
      bundle[table].push(value);
    }
  }
  return bundle;
}

function emptyBundle(): ExportBundle {
  const bundle = {} as ExportBundle;
  for (const table of TABLES) {
    bundle[table] = [];
  }
  return bundle;
}

function isExportTable(name: string): name is ExportTable {
  return (TABLES as readonly string[]).includes(name);
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
