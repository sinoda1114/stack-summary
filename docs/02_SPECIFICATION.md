# 02. 仕様書

- 対象: stack-summary
- 作成日: 2026-10-10
- 改訂: 2026-10-10（仕様レビュー判定の「直す」5点と「決めた一文」を手順にした。利用枠・文字数上限・Workflows は仮値）
- 関連文書: [01_REQUIREMENTS.md](01_REQUIREMENTS.md) / [03_STRUCTURE.md](03_STRUCTURE.md)

## 1. アーキテクチャ

```
ブラウザ（PC / スマホ）
   │  Cloudflare Access（Google 等でログイン、本人のメールのみ許可）
   ▼
┌──────────────────── Cloudflare Workers（1 つの Worker）────────────────────┐
│  静的配信: React + Mantine の画面（PWA）                                    │
│  fetch: /api/*  Hono の JSON API（Access JWT を検証。無いものは 403）       │
│         POST /api/imports ──▶ Workflow を起動                               │
│  Workflow: 取り込み処理（分割 → 保存 → 抽出 → 照合 → 分類）                  │
│            インスタンスの論理 ID は imports.id。各ステップは自然キーの upsert │
└───────────────┬──────────────────────────────────┬─────────────────────────┘
                ▼                                  ▼
           D1 (SQLite)                    Gemini API（Flash 系、構造化出力）
```

| 要素 | 技術 | 役割 |
| --- | --- | --- |
| 実行基盤 | Cloudflare Workers | 画面・API・取り込み処理を 1 つの Worker で担う |
| 認証 | Cloudflare Access + Worker での JWT 検証（`jose`） | 本人だけを通す。欠落は 403 |
| API | Hono | ルーティング、入力検証。ルートは資源ごとにファイルを分ける |
| 入力検証 | Zod | 画面・API・Gemini 出力で共通のスキーマ |
| 取り込み処理 | Cloudflare Workflows（仮） | ステップごとの再試行と進み具合の記録。仮の見積もりは 1 日 3000 ステップ、呼び出しあたり CPU 10 ミリ秒。Queues の代替は作らない |
| AI | Gemini API（`@google/genai`、Flash 系） | メモ分割、技術抽出、分類 |
| データ | D1 | 原文・メモ・技術・分類・好み |
| 画面 | React + Mantine | 全体図・詳細・取り込み・管理 |
| ビルド | Vite + `@cloudflare/vite-plugin` | 画面と Worker をまとめてビルド |

段階 1 は Worker の土台と Access JWT だけを置いた。段階 2 は D1 のマイグレーションと大分類 9 個の初期投入までである。Gemini、画面、取り込み Workflow はまだ作らない。

## 2. 設定値

| 名前 | 種別 | 内容 |
| --- | --- | --- |
| `GEMINI_API_KEY` | secret | Gemini の API キー。段階 4 以降 |
| `GEMINI_MODEL` | var | 使うモデル名（Flash 系）。コードに埋め込まない |
| `ACCESS_TEAM_DOMAIN` | var | `https://<team>.cloudflareaccess.com`。末尾スラッシュは付けない |
| `ACCESS_AUD` | var | Access アプリケーションの AUD タグ |
| `OWNER_EMAIL` | secret | 利用者本人のメールアドレス。リポジトリに書かない |
| `APP_ORIGIN` | var | 公開 URL（独自ドメイン） |
| `IMPORT_MAX_CHARS` | var | 仮として 50000。空、または超えた取り込みは 400 |

指示文の版は環境変数にしない。記録する値は各ファイルの定数（`split.v1`、`extract.v1`、`classify.v1`）であり、環境変数の文字列では文面を選ばない。

`wrangler` の設定で `workers_dev = false`、`preview_urls = false` とする。この 2 つは到達経路を狭めるだけで、認証の代わりにはしない。JWT が無い `/api` は、届いたリクエストを常に 403 にする（NFR-01）。

## 3. 状態と区分

### 3.1 好み（`techs.status`）

| 値 | 画面表示 | 色（Mantine） |
| --- | --- | --- |
| `adopted` | 採用中 | `teal` |
| `want_to_try` | 試したい | `blue` |
| `watching` | 様子見 | `yellow` |
| `rejected` | 見送り | `gray` |
| `unrated` | 未評価 | 枠線のみ |

状態の出所は `techs.status_by`、理由の出所は `techs.reason_by`。値は `user` または `model`。

### 3.2 関係（`memo_techs.relation`）

| 値 | 意味 | 技術として登録するか |
| --- | --- | --- |
| `subject` | メモの主題 | する |
| `comparison` | 主題と比べている対象 | する |
| `mention` | ついでに名前が出ただけ | しない（`memo_mentions` に記録） |

1 つのメモと 1 つの技術の関係は 1 つだけである。

### 3.3 取り込み（`imports.status`）

`queued` → `processing` → `done` / `failed`。終端まで失敗したときは必ず `failed` と `error` を書く。`failed` は再処理で `queued` に戻る。

### 3.4 出所

`user` は利用者の操作、`model` は Gemini または取り込み処理が書いた行である。再処理が置き換えてよいのは `model` だけである。

## 4. データ構造（D1）

> 段階 2 で `migrations/0001_init.sql` として確定した。大分類 9 個の初期行もそのファイルに入れる。
>
> D1 の外部キーは既定で有効である。接続のたびに `PRAGMA foreign_keys` を付ける確認は要らない。

```sql
-- 原文（常に保存。取り込みの同一性は raw_hash）
CREATE TABLE imports (
  id            TEXT PRIMARY KEY,
  raw_text      TEXT NOT NULL,
  raw_hash      TEXT NOT NULL UNIQUE,
  source_label  TEXT,
  status        TEXT NOT NULL CHECK (status IN ('queued','processing','done','failed')),
  memo_count    INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE memos (
  id           TEXT PRIMARY KEY,
  import_id    TEXT NOT NULL REFERENCES imports(id),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  url_set_hash TEXT,
  memo_date    TEXT,
  created_at   TEXT NOT NULL
);

-- 本文があるメモの自然キー。URL だけのメモは url_set_hash 側で同一にする
CREATE UNIQUE INDEX idx_memos_import_body
  ON memos (import_id, body)
  WHERE url_set_hash IS NULL;

CREATE UNIQUE INDEX idx_memos_url_set
  ON memos (url_set_hash)
  WHERE url_set_hash IS NOT NULL;

CREATE TABLE memo_urls (
  memo_id  TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  url      TEXT NOT NULL,
  PRIMARY KEY (memo_id, url)
);
CREATE INDEX idx_memo_urls_url ON memo_urls (url);

-- 本文が違い、URL が重なるメモ。重複にはしない（FR-05）
CREATE TABLE memo_similars (
  memo_id         TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  similar_memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  PRIMARY KEY (memo_id, similar_memo_id),
  CHECK (memo_id <> similar_memo_id)
);

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE subcategories (
  id           TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES categories(id),
  name         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL,
  created_by   TEXT NOT NULL CHECK (created_by IN ('ai','user')),
  reviewed     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  UNIQUE (category_id, name)
);

CREATE TABLE techs (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  name_key         TEXT NOT NULL UNIQUE,
  subcategory_id   TEXT REFERENCES subcategories(id),
  status           TEXT NOT NULL DEFAULT 'unrated'
                   CHECK (status IN ('adopted','want_to_try','watching','rejected','unrated')),
  status_by        TEXT NOT NULL DEFAULT 'model' CHECK (status_by IN ('user','model')),
  reason           TEXT,
  reason_by        TEXT CHECK (reason_by IS NULL OR reason_by IN ('user','model')),
  classified_by    TEXT CHECK (classified_by IS NULL OR classified_by IN ('user','model')),
  prompt_version   TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (reason IS NULL OR reason_by IS NOT NULL)
);

CREATE TABLE tech_aliases (
  alias_key  TEXT PRIMARY KEY,
  alias      TEXT NOT NULL,
  tech_id    TEXT NOT NULL REFERENCES techs(id) ON DELETE CASCADE,
  source     TEXT NOT NULL CHECK (source IN ('user','model'))
);

CREATE TABLE memo_techs (
  memo_id   TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  tech_id   TEXT NOT NULL REFERENCES techs(id) ON DELETE CASCADE,
  relation  TEXT NOT NULL CHECK (relation IN ('subject','comparison')),
  PRIMARY KEY (memo_id, tech_id)
);

CREATE TABLE memo_mentions (
  memo_id  TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  PRIMARY KEY (memo_id, name)
);

CREATE TABLE tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL CHECK (kind IN ('topic','vendor','project')),
  UNIQUE (kind, name)
);

CREATE TABLE tech_tags (
  tech_id  TEXT NOT NULL REFERENCES techs(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source   TEXT NOT NULL CHECK (source IN ('user','model')),
  PRIMARY KEY (tech_id, tag_id)
);

CREATE TABLE memo_tags (
  memo_id  TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source   TEXT NOT NULL CHECK (source IN ('user','model')),
  PRIMARY KEY (memo_id, tag_id)
);
```

- 大分類 9 個は `migrations/0001_init.sql` で初期投入する（FR-21）。
- `memos.body` は表示用である。リンクを除いた文字列のハッシュ列は置かない（FR-04）。
- `techs.subcategory_id` が NULL のときだけ未分類である。分類する書き込みは小分類 ID を必ず入れる。大分類の列は `techs` に置かない（FR-20）。
- 正式名は `name_key` で一意にする。`name_key` は §6.4 の別名キーと同じ正規化である。正式名と同じキーを `tech_aliases` にも入れ、照合は常に `alias_key` で行う（FR-12）。
- `locked` 列は置かない。確定は出所が `user` であることである。

### 4.1 自然キー

| 対象 | 自然キー | upsert の意味 |
| --- | --- | --- |
| 取り込み | `imports.raw_hash` | 一致する原文は新しい行を作らない |
| 本文があるメモ | `(import_id, body)` | 同じ取り込みの同じ表示断片は 1 行 |
| URL だけのメモ | `url_set_hash` | URL の集合が同じメモは 1 行 |
| 技術 | `techs.name_key` | 正規化して同じ正式名は 1 行 |
| 別名 | `tech_aliases.alias_key` | 正規化して同じ呼び方は 1 行 |
| メモと技術 | `(memo_id, tech_id)` | 役割は 1 つ |
| タグ | `(kind, name)` | 種類と名前で 1 行 |
| 技術タグ / メモタグ | 複合主キー | 同じタグは 1 行。出所が `user` の行は残す |
| 小分類 | `(category_id, name)` | 新設は衝突時に既存行を使う |

モデルの行を置き換える処理は、1 つの `db.batch()` に入れる。

## 5. 認証

1. Cloudflare Access のアプリケーションを独自ドメインに設定し、許可するのは `OWNER_EMAIL` だけにする。
2. `/api` のリクエストは、`Cf-Access-Jwt-Assertion` ヘッダーの JWT を検証する。ヘッダーが無い、空、検証に失敗したリクエストは 403 にする。欠落を本人のメールへ読み替えない。
3. 検証は `jose` の `jwtVerify` で行う。公開鍵は `ACCESS_TEAM_DOMAIN/cdn-cgi/access/certs` から取り、コードに埋め込まない。次をすべて満たすこと。
   - 署名が Access の公開鍵と合う（アルゴリズムは RS256）
   - `iss` が `ACCESS_TEAM_DOMAIN` と一致する
   - `aud` が `ACCESS_AUD` と一致する
   - `exp` があり、検証時点で期限を過ぎていない
   - `email` があり、`OWNER_EMAIL` と小文字で一致する
4. `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`OWNER_EMAIL` のいずれかが空なら、`/api` は 403 にする。設定ミスで素通りさせない。
5. 失敗の応答本文に、検証ライブラリのメッセージは出さない。共通の形で `forbidden` を返す。
6. 状態を変える API（POST / PATCH / DELETE）は、`Origin` が `APP_ORIGIN` と一致することも確認する。段階 1 には状態を変える API が無いため、この確認は最初の更新 API の段階で足す。
7. 固定ユーザー（JWT が無くても本人として通す分岐）は、本番の Worker に入れない。本番エントリ `src/worker/index.ts` から辿るモジュールに、その分岐を書かない。ローカル用の固定ユーザーを後から足す場合も、本番エントリのモジュールグラフの外に置く。

## 6. 取り込み処理（Workflow）

### 6.1 入口

`POST /api/imports` は本文 `{ text, sourceLabel? }` を受け取る。

1. `text` が空、または `IMPORT_MAX_CHARS` を超えたら 400 を返す。超えたときは分けて貼るよう表示する。仮の上限は 50000 文字である。
2. §6.2 で原文を正規化し、SHA-256 を `raw_hash` にする。
3. 同じ `raw_hash` の `imports` があれば、200 でその行を返す。Workflow は起動しない。Gemini は呼ばない。
4. 無ければ `imports` を `queued` で挿入し、Workflow を起動して 202 を返す。初回の Workflow インスタンス ID は `imports.id` である。パラメータの `importId` も `imports.id` である。同じ原文の同時挿入で一意制約に当たったときは、既存行を 200 で返す。Workflow の起動に失敗したときは行を消さず、原文を残し、`status` を `failed`、`error` を書いて 500 を返す。

### 6.2 原文の正規化

リンク表記は除かない。手順は次のとおり。

1. Unicode NFKC にする。
2. CRLF と CR を LF にする。
3. 各行の行末空白を除く。
4. 3 つ以上連続する LF を、LF 2 つにする。
5. 先頭と末尾の空白を除く。
6. UTF-8 バイト列の SHA-256 を、16 進小文字で `raw_hash` にする。

### 6.3 ステップ

各 `step.do` は再試行上限を 3 回と明示する（`retries.limit: 3`、遅延は指数バックオフ）。未設定の既定 5 回には頼らない。コミット後に応答だけが失われて同じステップが再実行されても、§4.1 の upsert で行は増えない。

再試行を使い切り、または不正な JSON を 1 回再試行したあとも不正なときは、その場で `imports.status = 'failed'` と `error` を書いて終える。失敗を書かずに終了しない。

仮: 取り込みは Cloudflare Workflows を使う。見込む上限は 1 日 3000 ステップ、呼び出しあたり CPU 10 ミリ秒。Queues の代替は作らない。

| ステップ | 処理 | Gemini |
| --- | --- | --- |
| 1. 分割 | 原文をメモ単位に区切る。技術メモでないものは件数だけ数える。各メモの表示用タイトル、表示用本文、日付、URL を取る | 使う |
| 2. 保存 | §6.5 でメモを upsert する。本文があるメモは `(import_id, body)`、URL だけのメモは `url_set_hash`。リンクを除いたハッシュでは飛ばさない。URL が既存メモと重なり、同一メモでなければ `memo_similars` に記録する | 使わない |
| 3. 抽出 | メモ 1 件ごとに、名前、関係、別名候補、タグ候補を出す。既存技術の ID も、全技術の一覧も渡さない | 使う |
| 4. 照合 | §6.4 の別名キーだけで既存技術に結ぶ。無ければ新規（状態は `unrated`、出所は `model`、小分類は NULL）。新機能は親の名前で照合し、そのメモを親の `memo_techs` にする。言及は `memo_mentions` へ。モデル行の置換は 1 つの `batch()` | 使わない |
| 5. 分類 | `classified_by` が `user` でない技術だけを分類器に渡す。扱いは §6.7 | 使う |

### 6.4 別名キー

同一性はこの正規化だけが決める。正式名の `name_key` も同じ手順である。

1. Unicode NFKC にする。
2. 英字を、ロケールに依存せず小文字にする。
3. 空白（Unicode の空白）、アンダースコア、ハイフンを除く。
4. 残った文字列をキーにする。空になった候補は捨て、`imports.error` に残す。

「Workers」は `workers`、「Cloudflare Workers」は `cloudflareworkers` になる。この 2 つは、どちらかがもう一方の別名候補として返り、同じ `alias_key` に結ばれたときに 1 件になる（AC-03）。空白を除いただけでは同一にしない。抽出の指示文に、短い呼び方と製品の正式名は同じ技術の名前と別名候補として返す、と書く。

照合で既存の `alias_key` に当たったときは、新しい技術を作らない。当たらない名前と別名候補は、新規技術の正式名と別名（出所 `model`）にする。正式名のキーは `tech_aliases` にも入れる。

### 6.5 URL だけのメモ

分割結果の本文が、URL と空白だけからなるとき、そのメモは URL だけである。

1. http と https だけを残す。
2. 各 URL の前後空白と、フラグメント（`#` 以降）を除く。
3. 重複を除いてソートする。
4. LF で連結した UTF-8 の SHA-256 を、16 進小文字で `url_set_hash` にする。

同じ `url_set_hash` のメモは 1 行である。本文があるメモも URL だけのメモも、URL が既存と 1 つでも重なり、同一メモではないときは重複にせず `memo_similars` へ書く（FR-05）。

### 6.6 新機能と格上げ

新機能は、抽出の指示で独立した名前にしない。モデルは親の製品名を `name` に返す。処理は返った `name` を §6.4 で照合し、そのメモを親技術の関連メモにする。`parent_tech_id` は置かない（FR-13）。

格上げ（`POST /api/mentions/promote` の `{ memoId, name }`）は同じ照合を通す。既存の `alias_key` に当たればその技術を使い、当たらなければ新規を作る。そのメモとの関係がまだ無ければ `subject` で `memo_techs` に書く。すでに関係があれば、その関係を残す。成功したら `memo_mentions` のその `(memoId, name)` を消す。

### 6.7 分類器（差し替え可能）

```ts
interface Classifier {
  classify(input: {
    tech: { name: string; context: string };
    categories: { id: string; name: string }[];
    subcategories: { id: string; categoryId: string; name: string; examples: string[] }[];
  }): Promise<
    | { kind: "existing"; subcategoryId: string; confidence: number }
    | { kind: "new"; categoryId: string; name: string; confidence: number }
    | { kind: "unclassified" }
  >;
}
```

戻りは提案である。処理側は次のときに未分類（`subcategory_id = NULL`、`classified_by = NULL`）にする。

- `kind` が `unclassified` である
- `categoryId` または `subcategoryId` が、渡した一覧に無い
- 新しい小分類の名前を NFKC し空白を除いた結果が、`その他`、`その他の技術`、`未分類`、`不明`、`other`、`others`、`misc`、`miscellaneous`、`uncategorized` のいずれかである

小分類の新設は次の upsert に閉じ込める。衝突したときは既存行を使い、`created_by` と `reviewed` は変えない。

```sql
INSERT INTO subcategories (id, category_id, name, sort_order, created_by, reviewed, created_at)
VALUES (?, ?, ?, ?, 'ai', 0, ?)
ON CONFLICT (category_id, name) DO NOTHING;
```

- 初版の実装は `GeminiClassifier` のみ。後から `ClefClassifier` などを同じ形で足せる（FR-29）。差し替え口は残す。
- 指示文のルール: 大分類は渡した一覧からしか選ばない（FR-22）。同じ小分類の技術同士が「どちらにするか」と比べられる関係になるよう選ぶ。新しい小分類を作る前に、既存の小分類で言い換えられないか確認する。「その他」のような寄せ集めは作らない（FR-24）。
- 確信度の数値だけでは未分類にしない。分布を見るまでは、取り込みの拒否条件にもしない（03 §4 段階 5）。
- 新規行の出所は `model`。`prompt_version` を記録する（NFR-08）。`classified_by = 'user'` の技術は、このステップで小分類を変えない。

### 6.8 Gemini の呼び出し

- 構造化出力（`responseMimeType: application/json` と `responseJsonSchema`）を使い、返った JSON を Zod で検証する。種別は JSON Schema の `enum` で渡す。日付は `format: date` で渡す。不正なら 1 回だけ再試行し、それでも不正なら、そのステップを失敗として `imports.status = 'failed'` と `error` を書く（NFR-04、§6.3）。
- 指示文は `src/worker/ai/prompts/` に版付きで置く。分類結果に記録する版は、その指示文ファイルの定数（`classify.v1` など）であり、環境変数では文面を選ばない（NFR-08）。
- メモ本文に含まれる指示文には従わないよう、指示文の側で明示する。出力は決めた JSON の形以外を受け付けないので、注入されても被害は分類の乱れにとどまる。
- 抽出の指示には次を含める。主題・比較・言及の判定。返すのは名前、関係、別名候補、タグ候補までで、既存 ID は返さない。新機能は親の製品名を `name` に入れる。会社やプロジェクト群は技術にせずベンダーのタグにする。短い呼び方と正式名は別名で結ぶ。
- 仮: 利用枠は有料枠。貼り付け全文を Gemini に送る。他人の発言は除かない。無料枠の規約確認は未了。

### 6.9 再処理

`POST /api/imports/:id/reprocess` は、`queued` または `processing` なら 409 を返す。それ以外は対象の `imports.status` を `queued` に戻し、`error` を空にして、Workflow を起動する。

完了済みまたは失敗済みの Workflow インスタンスは、同じインスタンス ID では再作成できない。再処理のインスタンス ID は `${imports.id}-${n}`（`n` はその取り込みの再処理回数）とし、パラメータの `importId` は元の `imports.id` のままにする。データの同一性は Workflow のインスタンス ID ではなく、`imports.id` と §4.1 の自然キーである。

各ステップは初回と同じ upsert を行う。置換は 1 つの `batch()` に入れる。

- 状態は `status_by = 'user'` のとき変えない。`model` の未評価も、再処理では書き直さない（抽出は状態を返さない）。
- 理由は `reason_by = 'user'` のとき変えない。
- 別名は、その技術の `source = 'model'` かつ `alias_key` が `name_key` と異なる行だけを消し、今回の別名候補を `model` で入れ直す。正式名の別名と、`source = 'user'` の別名は残す。
- タグは、その技術またはメモの `source = 'model'` の行だけを消し、今回の候補を入れ直す。`user` の行は残す。同じタグがすでに `user` であれば、`model` では上書きしない。
- 小分類は `classified_by = 'user'` のとき変えない。

### 6.10 統合

`POST /api/techs/:id/merge` の本文は `{ intoId, reasonChoice? }`。`intoId` が残す側、`:id` が統合元である。

1. `:id` と `intoId` が同じなら 400（`self_merge`）。行は変えない。
2. 両方の `reason` が空でないとき、`reasonChoice` が `into` または `source` でなければ 409（`reason_conflict`）。利用者に残す理由を選ばせる。選ばれた側の理由と `reason_by` を残す側に書く。片方だけが空でないときは、その理由と出所を残す側に残す。両方空なら理由は空のままにする。
3. 状態は残す側を残す。
4. 次を 1 つの `batch()` で、この順に行う。
   1. 残す側の `subcategory_id` と `classified_by` を、残す側の行に明示して書く。
   2. 別名・タグ・メモ関係のうち、キーが衝突する行は残す側を残す。同じメモに両方の役割があるときは、残す側の関係を残して 1 行に畳む。
   3. 衝突しない別名・タグ・メモ関係を残す側へ移す。移した別名の出所は、統合元の出所を保つ。
   4. 統合元の正式名を残す側の別名にする。`alias_key` が残す側に既にあれば、残す側の行を残す。無ければ出所 `user` で追加する。
   5. 統合元の技術を削除する。

## 7. JSON API

レスポンスは `{ success, data, error }` の共通の形にする。認証失敗は `{ success: false, data: null, error: { code: "forbidden", message: "認証に失敗しました" } }` と 403。

| メソッド・パス | 内容 |
| --- | --- |
| `GET /api/health` | 認証済みなら `{ ok: true }`。JWT が無ければ 403。段階 1 で実装する |
| `GET /api/overview?status=&tag=&q=` | 全体図。大分類 → 小分類 → 技術（`id` `name` `status` `memoCount`）。`q` は技術名、別名、理由。小分類が 1 つだけの大分類は、小分類名を返してよいが、画面は出さない（FR-27）。関連メモは `memo_date` の降順、空なら `created_at` の降順 |
| `GET /api/techs/:id` | 技術の詳細（別名・タグ・関連メモを新しい順、最終更新日） |
| `PATCH /api/techs/:id` | 状態・理由・小分類・タグの更新。変えた項目の出所を `user` にする。小分類を変えたら `classified_by = 'user'` |
| `POST /api/techs/:id/merge` | §6.10 |
| `POST /api/techs/:id/aliases` / `DELETE /api/techs/:id/aliases/:key` | 別名の追加・削除。追加の出所は `user`。正式名の `name_key` と同じキーは削除できない |
| `GET /api/techs?status=unrated` | 未評価の受け箱 |
| `GET /api/techs?unclassified=1` | `subcategory_id IS NULL` の受け箱 |
| `POST /api/mentions/promote` | §6.6 |
| `GET /api/subcategories/:id` | 小分類の比較一覧 |
| `GET /api/subcategories?reviewed=0` | `created_by = 'ai'` かつ `reviewed = 0` の小分類だけ |
| `PATCH /api/subcategories/:id` | 改名・大分類の移動・確認済みにする |
| `POST /api/subcategories/:id/merge` | `{ intoId }` へ統合（中の技術を移す） |
| `POST /api/subcategories` | 利用者が小分類を作る（`created_by = 'user'`、`reviewed = 1`）。分割はこれと移動で行う |
| `GET/POST/PATCH /api/categories` | 大分類の一覧・追加・改名・並べ替え |
| `GET /api/memos?q=&tag=` | メモの検索（`LIKE` による部分一致） |
| `GET /api/memos/:id` | メモの詳細（関連技術・言及・似たメモ） |
| `POST /api/imports` | §6.1。新規は 202、同じ原文は 200 |
| `GET /api/imports` / `GET /api/imports/:id` | 取り込み履歴と進み具合 |
| `POST /api/imports/:id/reprocess` | §6.9 |
| `GET /api/export?format=json\|markdown` | 書き出し（FR-50） |

- 検索は件数が数千件までの想定なので `LIKE` で行う。日本語の分かち書きが要る全文検索（FTS5）は使わない。
- ルートは上の資源ごとにファイルを分ける。1 ファイルに畳まない。

## 8. 画面（React + Mantine）

段階 1 では画面を作らない。次は段階 7 以降の形である。

| 画面 | 内容 | 主な Mantine 部品 |
| --- | --- | --- |
| 全体図（ホーム） | 大分類ごとのセクションに、小分類の行と技術のバッジ（状態の色）を並べる。小分類が 1 つだけの大分類は小分類名を出さず、技術だけを並べる。上部に状態・タグ・キーワードの絞り込み | `AppShell`、`SegmentedControl`、`MultiSelect`、`TextInput`、`Badge`、`SimpleGrid`、`Accordion`（スマホ） |
| 技術の詳細 | 状態・理由の編集、小分類の移動、別名・タグ、関連メモ（新しい順、関係を表示）、統合 | `Drawer`、`Select`、`Textarea`、`TagsInput`、`Timeline` |
| 小分類の比較 | 中の技術を状態・理由・関連メモ数・最終更新日で並べる | `Table` |
| メモ | 検索と一覧、詳細（関連技術・言及・似たメモ）。言及から技術への格上げ | `TextInput`、`Card`、`Anchor` |
| 取り込み | 貼り付け欄と取り込み履歴（進み具合・件数・失敗） | `Textarea`、`Progress`、`Table` |
| 受け箱 | 未評価・未分類・新しい小分類の 3 タブ。未評価は 1 件ずつ続けて好みを付けられる。新しい小分類は §7 の確認一覧だけ | `Tabs`、`Kbd` |
| 分類の管理 | 大分類の追加・改名・並べ替え、小分類の改名・統合・移動 | `Table`、`Modal` |

- 画面の文言はすべて日本語（FR-51）。
- スマホ幅（〜767px）では全体図・詳細・メモの閲覧だけを表示し、取り込み・編集・管理の操作は出さない（NFR-10）。
- メモ本文はテキストとして表示し、URL は http / https のものだけリンクにする（`rel="noopener noreferrer"`、NFR-03）。
- PWA は `manifest.webmanifest` とアイコンのみ。Service Worker で API の応答をキャッシュしない。
- ルーティングは画面数が多いため `react-router` を使う。

## 9. 配置先

| 環境 | 配置先 | 反映方法 |
| --- | --- | --- |
| ローカル | `vite dev` + ローカル D1。固定ユーザーを使う場合も、本番エントリのモジュールには入れない | 手動 |
| Production | 独自ドメインの Workers + Access | main マージで自動デプロイ（NFR-12）。workflow は段階 10 で足す |

Preview URL は無効にするため（§2）、確認はローカルで行う。無効化しても、JWT が無い `/api` は 403 のままである。

## 10. 検証仕様

| 対象 | 方法 | 対応 |
| --- | --- | --- |
| 原文の正規化、`raw_hash`、URL 集合の同一性、リンクを除かないこと | 単体テスト | FR-04, FR-05, AC-02 |
| 別名キー、正式名の一意、新機能が親の関連メモになること | 単体テスト | FR-12, FR-13, AC-03, AC-05 |
| 取り込み Workflow（成功・Gemini 失敗・不正 JSON・再処理・終端の `failed`・モデル行だけ置換） | 結合テスト。Gemini はモック | FR-06, FR-07, NFR-07, AC-06, AC-11 |
| 関係の振り分け（主題・比較・言及）と格上げ（既定 `subject`、言及行の削除） | 結合テスト（モックの抽出結果を入力） | FR-10, FR-11, AC-04 |
| 分類器の制約（大分類を作らない、実在しない ID と「その他」は未分類、upsert） | 単体テスト | FR-22, FR-23, FR-24, AC-07 |
| 統合（自己統合の拒否、理由の衝突、分類を残してから削除、正式名を別名にする） | 結合テスト | FR-15, AC-13 |
| Access JWT（無し、空、不正、別メール、別 aud、期限切れ、別の発行者、設定欠落） | 結合テスト | NFR-01, AC-10 |
| リンクの安全な描画 | コンポーネントテスト | NFR-03 |
| 書き出し | 結合テスト | FR-50, AC-12 |
| 分類の正答率 | 評価スクリプト。正解付きサンプル 20〜30 件（ローカルのみ、コミットしない）。仮の目安は大分類 90%、小分類 80%。未達でも次の段階を止めない | NFR-09 |
| 本番の認証 | デプロイ後、JWT 無しで独自ドメインと `*.workers.dev` にアクセスし、`/api` が 403 であることを確認 | AC-10 |

テストは Vitest と `@cloudflare/vitest-plugin` で行う。カバレッジ 80% 以上（NFR-09。閾値の強制は分類と画面が載ってからでよい。段階 1 は認証のテストが CI で通ることを完了とする）。

段階 1 の完了は、CI が緑であること、JWT が無い `GET /api/health` が 403 であること、本番エントリに固定ユーザーの分岐が無いこと、である。

段階 2 の完了は、マイグレーション適用後に仕様の表があり、大分類が 9 個入っていることである。

分類の評価ファイルは、仮として `eval/golden.local.json` の `{ samples: [{ name, context, expected: { categoryId, subcategoryId }, predicted? }] }` である。`predicted` が無い行は採点しない。ファイルが無いこと、および仮の目安に届かないことは失敗にしない。正解サンプルは未確定で、コミットしない。

## 11. 要件との対応

| 要件 | 仕様の該当箇所 |
| --- | --- |
| FR-01〜07 | §4、§6、§7（imports） |
| FR-10〜15 | §3.2、§4、§6.4、§6.6、§6.10、§7 |
| FR-20〜29 | §4、§6.7、§7（subcategories・categories）、§8（FR-27） |
| FR-30〜33 | §3.1、§4（tags.kind = project）、§7、§8（受け箱） |
| FR-40〜45 | §7（overview・techs・memos）、§8 |
| FR-50, FR-51 | §7（export）、§8 |
| NFR-01 | §2、§5、§10 |
| NFR-02 | §2、03 §1 |
| NFR-03, NFR-04 | §6.8、§8 |
| NFR-05, NFR-06 | 01 §10（仮値）、§10（サンプルはローカルのみ） |
| NFR-07 | §6.3、§6.9 |
| NFR-08 | §4（classified_by・prompt_version）、§6.8 |
| NFR-09 | §10 |
| NFR-10 | §8 |
| NFR-11, NFR-12 | §1、§9、03 §4 段階 10 |
