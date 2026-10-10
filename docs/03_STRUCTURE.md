# 03. ストラクチャ構造

- 対象: stack-summary
- 作成日: 2026-10-10
- 改訂: 2026-10-10（仕様レビュー判定の「直す」5点と「決めた一文」を手順にした）
- 関連文書: [01_REQUIREMENTS.md](01_REQUIREMENTS.md) / [02_SPECIFICATION.md](02_SPECIFICATION.md)

## 1. ディレクトリ構成

この木は完成形である。段階 1 でリポジトリに置くのは §4 の段階 1 に書いたファイルだけである。

```
stack-summary/
├── docs/
├── migrations/
│   └── 0001_init.sql
├── public/
│   ├── manifest.webmanifest
│   └── icons/
├── eval/
│   ├── README.md
│   └── golden.local.json
├── scripts/
│   └── eval-classify.ts
├── src/
│   ├── shared/
│   │   ├── schema.ts
│   │   └── labels.ts
│   ├── worker/
│   │   ├── index.ts
│   │   ├── app.ts
│   │   ├── env.ts
│   │   ├── http.ts
│   │   ├── middleware/
│   │   │   ├── access-auth.ts
│   │   │   └── origin-check.ts
│   │   ├── routes/
│   │   │   ├── overview.ts
│   │   │   ├── techs.ts
│   │   │   ├── mentions.ts
│   │   │   ├── subcategories.ts
│   │   │   ├── categories.ts
│   │   │   ├── memos.ts
│   │   │   ├── imports.ts
│   │   │   └── export.ts
│   │   ├── workflows/
│   │   │   └── import-workflow.ts
│   │   ├── ingest/
│   │   │   ├── normalize.ts
│   │   │   └── resolve-tech.ts
│   │   ├── ai/
│   │   │   ├── gemini.ts
│   │   │   ├── split-memos.ts
│   │   │   ├── extract-techs.ts
│   │   │   ├── classifier.ts
│   │   │   ├── gemini-classifier.ts
│   │   │   └── prompts/
│   │   │       ├── split.v1.ts
│   │   │       ├── extract.v1.ts
│   │   │       └── classify.v1.ts
│   │   └── db/
│   │       ├── imports.ts
│   │       ├── memos.ts
│   │       ├── techs.ts
│   │       ├── taxonomy.ts
│   │       └── tags.ts
│   └── client/
│       ├── main.tsx
│       ├── api.ts
│       ├── hooks/
│       │   └── useIsMobile.ts
│       ├── pages/
│       │   ├── OverviewPage.tsx
│       │   ├── SubcategoryPage.tsx
│       │   ├── MemosPage.tsx
│       │   ├── MemoPage.tsx
│       │   ├── ImportPage.tsx
│       │   ├── InboxPage.tsx
│       │   └── TaxonomyPage.tsx
│       └── components/
│           ├── TechBadge.tsx
│           ├── TechDrawer.tsx
│           ├── OverviewFilters.tsx
│           ├── MemoBody.tsx
│           ├── MergeDialog.tsx
│           └── ImportProgress.tsx
├── test/
│   ├── worker/
│   └── client/
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── wrangler.jsonc
├── tsconfig.json
├── package.json / package-lock.json
├── .npmrc
├── .dev.vars.example
└── .github/
    ├── workflows/ci.yml
    └── dependabot.yml
```

`.gitignore` に `.dev.vars` と `eval/*.local.json` を入れる（NFR-02、NFR-06）。`.dev.vars.example` は無視しない。

固定ユーザーの分岐は、本番エントリ `src/worker/index.ts` から辿るモジュールに置かない（02 §5）。ローカル専用の入り口を後から足す場合も、このエントリの外にする。

## 2. ファイル責務と仕様の対応

| 仕様（02） | 担当ファイル |
| --- | --- |
| §1 構成 | `vite.config.ts`、`wrangler.jsonc`、`src/worker/index.ts`、`src/worker/app.ts` |
| §2 設定値 | `src/worker/env.ts`、`wrangler.jsonc`、`.dev.vars.example` |
| §3 状態と区分 | `src/shared/schema.ts`、`src/shared/labels.ts` |
| §4 データ構造 | `migrations/0001_init.sql`、`src/worker/db/*` |
| §4.1 自然キー、§6.2 原文、§6.4 別名キー、§6.5 URL 集合 | `src/worker/ingest/normalize.ts`、`src/worker/ingest/resolve-tech.ts` |
| §5 認証 | `src/worker/middleware/access-auth.ts`。`origin-check.ts` は状態を変える API の段階 |
| §6 取り込み処理 | `src/worker/workflows/import-workflow.ts` |
| §6.8 Gemini の呼び出し | `src/worker/ai/gemini.ts`、`split-memos.ts`、`extract-techs.ts`、`prompts/*` |
| §6.7 分類器 | `src/worker/ai/classifier.ts`、`gemini-classifier.ts`、`prompts/classify.v1.ts` |
| §6.10 統合、§6.6 格上げ | `src/worker/routes/techs.ts`、`src/worker/routes/mentions.ts`、`src/worker/db/techs.ts` |
| §7 JSON API | `src/worker/routes/*`、`src/client/api.ts`。資源ごとにファイルを分ける |
| §8 画面 | `src/client/*` |
| §9 配置先 | `wrangler.jsonc`、`.github/workflows/ci.yml`。自動デプロイは段階 10 |
| §10 検証 | `test/*`、`scripts/eval-classify.ts`、`eval/README.md` |

## 3. 依存パッケージ

| パッケージ | 用途 | 区分 |
| --- | --- | --- |
| `hono` | API | 本番 |
| `zod` | 入力・出力の検証 | 本番 |
| `jose` | Access JWT の検証 | 本番 |
| `@google/genai` | Gemini API | 本番。段階 4 以降 |
| `react` / `react-dom` / `react-router` | 画面とルーティング | 本番。段階 7 以降 |
| `@mantine/core` / `@mantine/hooks` | UI 部品 | 本番。段階 7 以降 |
| `vite` / `@vitejs/plugin-react` / `@cloudflare/vite-plugin` | ビルド・開発 | 開発。画面の段階 |
| `wrangler` | デプロイ・型生成・D1 マイグレーション | 開発 |
| `typescript` | 型検査 | 開発 |
| `vitest` / `@cloudflare/vitest-plugin` | テスト。旧 `@cloudflare/vitest-pool-workers` の後継 | 開発 |
| `@testing-library/react` | 画面のテスト | 開発。段階 7 以降 |

line-send と共通の部分（Hono、React、Mantine、Vite、テスト）は、line-send に版があるとき同じ版に揃える。段階 1 の時点で line-send に `package.json` が無いため、段階 1 は Worker の土台に必要な `hono`、`jose`、`wrangler`、`typescript`、`vitest`、`@cloudflare/vitest-plugin` だけを入れる。

`.npmrc` は `ignore-scripts=true`、`save-exact=true`、`audit-level=high` とする。

## 4. 実装の優先順位

価値の中心で、かつ不確実性の高い「取り込みと分類」を先に作り、評価で確かめてから画面を載せる。

| 順 | 内容 | 完了の目安 | 対応 |
| --- | --- | --- | --- |
| 1 | 土台: 雛形、`.npmrc`、CI、Dependabot、Access JWT 検証。固定ユーザーは本番の Worker に入れない | CI が緑。JWT なしの `GET /api/health` が 403 | NFR-01 |
| 2 | D1 マイグレーション（スキーマは `migrations/0001_init.sql`） | テーブルと大分類 9 個ができる | 02 §4 |
| 3 | 正規化・重複判定・別名照合（Gemini なし） | 単体テストが通る | FR-04, FR-05, FR-12, FR-13 |
| 4 | Gemini 呼び出しと 3 つの指示文（分割・抽出・分類） | モックで結合テストが通る | FR-03, FR-10, FR-11, FR-23 |
| 5 | 評価: 正解付きサンプルで正答率を測り、指示文を調整 | 大分類の正答率 90%、小分類 80% を目安 | NFR-09 |
| 6 | 取り込み Workflow と取り込み画面 | 実データを貼ると全体図の元データができる。再処理で利用者の行が守られる。終端の失敗は `failed` | FR-01〜07 |
| 7 | 全体図・技術の詳細・小分類の比較（Mantine） | 状態の付与と絞り込みができる | FR-30〜33, FR-40〜43 |
| 8 | 受け箱と分類の管理（統合・移動・改名） | 新しい小分類を確認・統合できる。技術の統合は 02 §6.10 | FR-15, FR-24〜27 |
| 9 | メモ検索・言及の格上げ・書き出し | 書き出しから全データが読める | FR-11, FR-44, FR-50 |
| 10 | スマホ閲覧と PWA、本番デプロイ | 375px で全体図を見られる。未認証の `/api` が拒否される。main マージで自動デプロイされる | NFR-10, NFR-12, AC-10 |

各段階は feature ブランチと PR で進める。段階 1 の CI は、push と pull_request でテストが走ることである。自動デプロイの workflow は段階 10 で足す。段階 1 の CI はその入口になる。

段階 1 で置くファイルは次のとおり。

- `package.json`、`package-lock.json`、`.npmrc`、`tsconfig.json`、`wrangler.jsonc`、`vitest.config.ts`
- `.dev.vars.example`、`.github/workflows/ci.yml`、`.github/dependabot.yml`
- `src/worker/index.ts`、`src/worker/app.ts`、`src/worker/http.ts`、`src/worker/middleware/access-auth.ts`
- `test/worker/access-auth.test.ts`
- `wrangler types` が書く `worker-configuration.d.ts`

`ci.yml` は `sinoda1114/ci-standard` の Node CI を呼ぶ。Dependabot は npm と github-actions を週次で見る。`wrangler.jsonc` は `workers_dev = false`、`preview_urls = false` とする。D1 バインディング、Gemini、画面、`origin-check.ts` は段階 1 に含めない。

段階 2 で置くファイルは次のとおり。

- `migrations/0001_init.sql`
- `test/apply-migrations.ts`
- `test/worker/schema.test.ts`
- `wrangler.jsonc` の D1 バインディング `DB`（`migrations_dir` は `migrations`）

段階 2 に Gemini、画面、取り込み Workflow は含めない。リモート D1 の `database_id` は本番配置の前に置く。

### 段階の注記

検討は閉じない。各段階に入るとき、次を仕様の手順に足す。

- 段階 5 の前: 大分類 9 個について、入れる例と入れない例を書く。確信度 0.5 未満を未分類にする規則は、モデルの自己申告なので、分布を見るまで取り込みの拒否条件にしない。
- 段階 6 の前: 自分以外の発言を Gemini に送るかは、01 §10 のまま利用者の判断である。無料枠を選ぶなら、Workflow の最初で自分以外を除く。Workflows は Workers の無料枠にある。未決は 1 日 3,000 ステップと、呼び出しあたり CPU 10 ミリ秒で足りるかである。Queues の代替は、足りないと分かってから書く。抽出に失敗したメモは技術が無いので、全体図にも未分類の受け箱にも出ない。失敗はメモごとに行で残し、取り込み画面で見えるようにする。
- 段階 7: 関連メモの順は `memo_date` の降順、空なら `created_at` とする。日付は `YYYY-MM-DD` だけを保存する。全体図の `q` は技術名、別名、理由を見る。技術詳細は `/techs/:id` にする。Drawer だけだと、見返しの途中で再読込すると判断の画面が閉じる。
- 段階 9: 書き出しの JSON は、表と 1 対 1 のキーを、その段階の仕様に書く。別名、関係、言及、タグ、確定、原文を含める。

## 5. 篠田さんの作業

1. Google AI Studio で Gemini の API キーを発行する（利用枠は 01 §10 の決定に従う）。段階 4 の前でよい。
2. Cloudflare Zero Trust で Access アプリケーションを作り、独自ドメインに設定する。許可は自分のメールだけにして、AUD タグを控える。`OWNER_EMAIL` は secret とし、リポジトリに書かない。
3. 段階 10 の前に、GitHub Actions へ `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録する。
4. 段階 5 で使う正解付きサンプル（20〜30 件）の作成に協力する（案を作り、正解を確認していただく）。

## 6. 文書間の整合チェック

- 01 の FR-01〜51、NFR-01〜12 は、すべて 02 §11 で仕様に対応づけた。
- 02 の各節は、すべて本書 §2 で担当ファイルに対応づけた。段階 1 でまだ置かないファイルは、§4 の順で足す。
- 用語（メモ・技術・大分類・小分類・タグ・状態・関係・出所・確定）は 01 §5 の定義で統一した。
- 初版の対象外（構成セット、Discord 投稿、意味検索、リンク先の取得、判断モデル、原文の削除、`parent_tech_id`）は、02・03 に実装を含めていない。判断モデルは `Classifier` インターフェースで差し替え口だけを用意した。タグ表と、API の資源ごとのルート分割は残した。
- 検討（利用枠、Workflows の枠、書き出しのキー、関連メモの順、失敗メモの表示、技術詳細の URL、分類の例と確信度）は §4 の注記に残し、未決のままである。
