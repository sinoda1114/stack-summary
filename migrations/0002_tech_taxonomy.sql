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

CREATE TRIGGER tech_relations_no_reverse
BEFORE INSERT ON tech_relations
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM tech_relations
  WHERE from_tech_id = NEW.to_tech_id
    AND to_tech_id = NEW.from_tech_id
)
BEGIN
  SELECT RAISE(ABORT, 'tech relation pair exists');
END;

-- タグの名寄せキー。既存行はアプリが次に書くとき埋める。NULL は一意制約で衝突しない。
ALTER TABLE tags ADD COLUMN name_key TEXT;

CREATE UNIQUE INDEX idx_tags_kind_name_key ON tags (kind, name_key);
