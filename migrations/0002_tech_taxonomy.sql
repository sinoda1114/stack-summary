-- 大分類は techs に1つ。小分類は中間表。今の単一 subcategory_id はそこへ移す。
ALTER TABLE techs ADD COLUMN category_id TEXT REFERENCES categories(id);

UPDATE techs
SET category_id = (
  SELECT category_id FROM subcategories WHERE subcategories.id = techs.subcategory_id
)
WHERE subcategory_id IS NOT NULL;

CREATE TABLE tech_subcategories (
  tech_id         TEXT NOT NULL REFERENCES techs(id) ON DELETE CASCADE,
  subcategory_id  TEXT NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
  PRIMARY KEY (tech_id, subcategory_id)
);

CREATE INDEX idx_tech_subcategories_subcategory
  ON tech_subcategories (subcategory_id);

INSERT INTO tech_subcategories (tech_id, subcategory_id)
SELECT id, subcategory_id FROM techs
WHERE subcategory_id IS NOT NULL;

ALTER TABLE techs DROP COLUMN subcategory_id;

CREATE INDEX idx_techs_category ON techs (category_id);

-- 同じ組は1つ。向きは from → to。逆向きの行はトリガで拒む。
CREATE TABLE tech_relations (
  from_tech_id  TEXT NOT NULL REFERENCES techs(id) ON DELETE CASCADE,
  to_tech_id    TEXT NOT NULL REFERENCES techs(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('runs_on', 'depends_on', 'related')),
  PRIMARY KEY (from_tech_id, to_tech_id),
  CHECK (from_tech_id <> to_tech_id)
);

CREATE INDEX idx_tech_relations_to ON tech_relations (to_tech_id);

CREATE UNIQUE INDEX idx_tech_relations_pair
  ON tech_relations (
    MIN(from_tech_id, to_tech_id),
    MAX(from_tech_id, to_tech_id)
  );

-- タグの名寄せキー。同じ kind で正規化が衝突する行は、1件だけ埋める。
ALTER TABLE tags ADD COLUMN name_key TEXT;

UPDATE tags
SET name_key = lower(trim(name))
WHERE name_key IS NULL
  AND id = (
    SELECT MIN(other.id) FROM tags AS other
    WHERE other.kind = tags.kind
      AND lower(trim(other.name)) = lower(trim(tags.name))
  );

CREATE UNIQUE INDEX idx_tags_kind_name_key ON tags (kind, name_key);
