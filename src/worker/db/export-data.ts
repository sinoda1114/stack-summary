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
      parts.push(writeRow(fields));
    }
    parts.push("");
  }
  return parts.join("\n");
}

export function parseExportMarkdown(markdown: string): ExportBundle {
  const bundle = emptyBundle();
  let table: ExportTable | null = null;
  let row: string | null = null;
  const flush = (): void => {
    if (table === null || row === null) {
      return;
    }
    bundle[table].push(parseRow(row));
    row = null;
  };
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      flush();
      const name = line.slice(3);
      table = isExportTable(name) ? name : null;
      continue;
    }
    if (table === null) {
      continue;
    }
    if (line === "（行なし）") {
      flush();
      continue;
    }
    if (line.startsWith("- ")) {
      flush();
      row = line.slice(2);
      continue;
    }
    if (line.startsWith("  ") && row !== null) {
      row = `${row}\n${line.slice(2)}`;
    }
  }
  flush();
  return bundle;
}

function writeRow(fields: string): string {
  const lines = fields.split("\n");
  return lines
    .map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`))
    .join("\n");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "\\null";
  }
  if (typeof value === "string") {
    return escapeField(value);
  }
  if (typeof value === "number") {
    return `\\num:${String(value)}`;
  }
  if (typeof value === "boolean") {
    return `\\bool:${value ? "true" : "false"}`;
  }
  return escapeField(JSON.stringify(value));
}

function escapeField(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\r", "\\r").replaceAll("|", "\\|");
}

function parseRow(text: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of splitFields(text)) {
    const eq = field.indexOf("=");
    if (eq < 0) {
      continue;
    }
    row[field.slice(0, eq)] = parseField(field.slice(eq + 1));
  }
  return row;
}

function parseField(raw: string): unknown {
  if (raw === "\\null") {
    return null;
  }
  if (raw.startsWith("\\num:")) {
    return Number(raw.slice("\\num:".length));
  }
  if (raw === "\\bool:true") {
    return true;
  }
  if (raw === "\\bool:false") {
    return false;
  }
  return unescapeField(raw);
}

function unescapeField(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\" || index + 1 >= value.length) {
      out += char ?? "";
      continue;
    }
    const next = value[index + 1];
    if (next === "\\") {
      out += "\\";
    } else if (next === "r") {
      out += "\r";
    } else if (next === "|") {
      out += "|";
    } else {
      out += `${char}${next ?? ""}`;
    }
    index += 1;
  }
  return out;
}

function splitFields(text: string): string[] {
  const fields: string[] = [];
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith(" | ", index) && !endsWithOddBackslash(current)) {
      fields.push(current);
      current = "";
      index += 2;
      continue;
    }
    current += text[index] ?? "";
  }
  fields.push(current);
  return fields;
}

function endsWithOddBackslash(value: string): boolean {
  let count = 0;
  for (let index = value.length - 1; index >= 0 && value[index] === "\\"; index -= 1) {
    count += 1;
  }
  return count % 2 === 1;
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
