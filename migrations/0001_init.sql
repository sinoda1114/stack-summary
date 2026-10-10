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

-- FR-21。並びは要件の順。id は初期行の安定キー。
INSERT INTO categories (id, name, sort_order, created_at) VALUES
  ('language', '言語', 1, '2026-10-10T00:00:00.000Z'),
  ('frontend', 'フロントエンド', 2, '2026-10-10T00:00:00.000Z'),
  ('backend', 'バックエンド', 3, '2026-10-10T00:00:00.000Z'),
  ('database', 'データベース', 4, '2026-10-10T00:00:00.000Z'),
  ('infra', 'インフラ', 5, '2026-10-10T00:00:00.000Z'),
  ('dev-tools', '開発ツール', 6, '2026-10-10T00:00:00.000Z'),
  ('ai-model', 'AI モデル', 7, '2026-10-10T00:00:00.000Z'),
  ('ai-dev-tools', 'AI 開発ツール', 8, '2026-10-10T00:00:00.000Z'),
  ('external-api', '外部 API', 9, '2026-10-10T00:00:00.000Z');
