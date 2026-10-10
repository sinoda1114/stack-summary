export type CategoryGuidance = {
  id: string;
  name: string;
  include: readonly string[];
  exclude: readonly string[];
};

// 仮。正解サンプルではない。分布を見る前の振り分けの目安。
export const provisionalCategoryGuidance: readonly CategoryGuidance[] = [
  {
    id: "language",
    name: "言語",
    include: ["TypeScript", "Rust"],
    exclude: ["React"],
  },
  {
    id: "frontend",
    name: "フロントエンド",
    include: ["React", "CSS"],
    exclude: ["PostgreSQL"],
  },
  {
    id: "backend",
    name: "バックエンド",
    include: ["Hono", "Node.js"],
    exclude: ["React"],
  },
  {
    id: "database",
    name: "データベース",
    include: ["SQLite", "D1"],
    exclude: ["Hono"],
  },
  {
    id: "infra",
    name: "インフラ",
    include: ["Cloudflare Workers", "Terraform"],
    exclude: ["React"],
  },
  {
    id: "dev-tools",
    name: "開発ツール",
    include: ["Vite", "ESLint"],
    exclude: ["Gemini"],
  },
  {
    id: "ai-model",
    name: "AI モデル",
    include: ["Gemini", "GPT"],
    exclude: ["Cursor"],
  },
  {
    id: "ai-dev-tools",
    name: "AI 開発ツール",
    include: ["Cursor", "Claude Code"],
    exclude: ["Gemini"],
  },
  {
    id: "external-api",
    name: "外部 API",
    include: ["Stripe", "GitHub API"],
    exclude: ["Hono"],
  },
];
