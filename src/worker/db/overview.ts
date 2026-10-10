import type { TechStatus } from "../../shared/labels";

export type OverviewTech = {
  id: string;
  name: string;
  status: TechStatus;
  memoCount: number;
};

export type OverviewSubcategory = {
  id: string;
  name: string;
  techs: OverviewTech[];
};

export type OverviewCategory = {
  id: string;
  name: string;
  subcategoryCount: number;
  subcategories: OverviewSubcategory[];
};

export type OverviewFilter = {
  status: TechStatus | null;
  tag: string | null;
  q: string | null;
};

export async function loadOverview(
  db: D1Database,
  filter: OverviewFilter,
): Promise<OverviewCategory[]> {
  const categories = await db
    .prepare("SELECT id, name FROM categories ORDER BY sort_order")
    .all<{ id: string; name: string }>();
  const subcategories = await db
    .prepare(
      `SELECT id, category_id, name
       FROM subcategories
       ORDER BY sort_order, name`,
    )
    .all<{ id: string; category_id: string; name: string }>();
  const like = filter.q === null ? null : likePattern(filter.q);
  const techs = await db
    .prepare(
      `SELECT t.id, t.name, t.status, t.subcategory_id,
              (SELECT COUNT(*) FROM memo_techs mt WHERE mt.tech_id = t.id) AS memo_count
       FROM techs t
       WHERE t.subcategory_id IS NOT NULL
         AND (?1 IS NULL OR t.status = ?1)
         AND (?2 IS NULL OR EXISTS (
           SELECT 1 FROM tech_tags tt
           JOIN tags g ON g.id = tt.tag_id
           WHERE tt.tech_id = t.id AND g.name = ?2
         ))
         AND (?3 IS NULL OR t.name LIKE ?3 ESCAPE '\\'
              OR IFNULL(t.reason, '') LIKE ?3 ESCAPE '\\'
              OR EXISTS (
                SELECT 1 FROM tech_aliases a
                WHERE a.tech_id = t.id AND a.alias LIKE ?3 ESCAPE '\\'
              ))
       ORDER BY t.name`,
    )
    .bind(filter.status, filter.tag, like)
    .all<{
      id: string;
      name: string;
      status: TechStatus;
      subcategory_id: string;
      memo_count: number;
    }>();

  const techsBySubcategory = new Map<string, OverviewTech[]>();
  for (const tech of techs.results) {
    const list = techsBySubcategory.get(tech.subcategory_id) ?? [];
    list.push({
      id: tech.id,
      name: tech.name,
      status: tech.status,
      memoCount: tech.memo_count,
    });
    techsBySubcategory.set(tech.subcategory_id, list);
  }

  const filtering = filter.status !== null || filter.tag !== null || filter.q !== null;
  return categories.results.flatMap((category) => {
    const owned = subcategories.results.filter((subcategory) => subcategory.category_id === category.id);
    const groups = owned
      .map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        techs: techsBySubcategory.get(subcategory.id) ?? [],
      }))
      .filter((subcategory) => !filtering || subcategory.techs.length > 0);
    if (filtering && groups.length === 0) {
      return [];
    }
    return [
      {
        id: category.id,
        name: category.name,
        subcategoryCount: owned.length,
        subcategories: groups,
      },
    ];
  });
}

function likePattern(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  return `%${escaped}%`;
}
