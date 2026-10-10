const TABLES = [
  "imports",
  "memos",
  "memo_urls",
  "memo_similars",
  "categories",
  "subcategories",
  "techs",
  "tech_aliases",
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
      const fields = Object.entries(row)
        .map(([key, value]) => `${key}=${formatValue(value)}`)
        .join(" | ");
      parts.push(`- ${fields}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.replaceAll("\n", " ");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
