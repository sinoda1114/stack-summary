import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const TABLES = [
  "categories",
  "imports",
  "memo_mentions",
  "memo_similars",
  "memo_tags",
  "memo_techs",
  "memo_urls",
  "memos",
  "subcategories",
  "tags",
  "tech_aliases",
  "tech_relations",
  "tech_subcategories",
  "tech_tags",
  "techs",
] as const;

const CATEGORIES = [
  { id: "language", name: "言語", sort_order: 1 },
  { id: "frontend", name: "フロントエンド", sort_order: 2 },
  { id: "backend", name: "バックエンド", sort_order: 3 },
  { id: "database", name: "データベース", sort_order: 4 },
  { id: "infra", name: "インフラ", sort_order: 5 },
  { id: "dev-tools", name: "開発ツール", sort_order: 6 },
  { id: "ai-model", name: "AI モデル", sort_order: 7 },
  { id: "ai-dev-tools", name: "AI 開発ツール", sort_order: 8 },
  { id: "external-api", name: "外部 API", sort_order: 9 },
] as const;

describe("D1 の初期スキーマ", () => {
  it("仕様の表ができる", async () => {
    const listed = await env.DB.prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT GLOB '_*'
         AND name != 'd1_migrations'
       ORDER BY name`,
    ).all<{ name: string }>();

    expect(listed.results.map((row) => row.name)).toEqual([...TABLES]);
  });

  it("大分類が 9 個、要件の名前と並びで入る", async () => {
    const listed = await env.DB.prepare(
      "SELECT id, name, sort_order FROM categories ORDER BY sort_order",
    ).all<{ id: string; name: string; sort_order: number }>();

    expect(listed.results).toEqual([...CATEGORIES]);
  });
});
