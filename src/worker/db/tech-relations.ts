import type { RelationKind } from "../../shared/relations";

export type TechRelationEdge = {
  fromId: string;
  toId: string;
  kind: RelationKind;
};

export type TechRelationNode = {
  id: string;
  name: string;
};

export function relationPairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}\n${rightId}` : `${rightId}\n${leftId}`;
}

export async function relationPairExists(
  db: D1Database,
  fromTechId: string,
  toTechId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM tech_relations
       WHERE (from_tech_id = ? AND to_tech_id = ?)
          OR (from_tech_id = ? AND to_tech_id = ?)`,
    )
    .bind(fromTechId, toTechId, toTechId, fromTechId)
    .first<{ found: number }>();
  return row !== null;
}

export async function insertTechRelation(
  db: D1Database,
  input: { fromTechId: string; toTechId: string; kind: RelationKind },
): Promise<boolean> {
  if (input.fromTechId === input.toTechId) {
    return false;
  }
  if (await relationPairExists(db, input.fromTechId, input.toTechId)) {
    return false;
  }
  const techs = await db
    .prepare(
      `SELECT id FROM techs WHERE id = ?1 OR id = ?2`,
    )
    .bind(input.fromTechId, input.toTechId)
    .all<{ id: string }>();
  const ids = new Set(techs.results.map((tech) => tech.id));
  if (!ids.has(input.fromTechId) || !ids.has(input.toTechId)) {
    return false;
  }
  await db
    .prepare(
      `INSERT INTO tech_relations (from_tech_id, to_tech_id, kind)
       VALUES (?, ?, ?)`,
    )
    .bind(input.fromTechId, input.toTechId, input.kind)
    .run();
  return true;
}

export async function loadRelationGraph(db: D1Database): Promise<{
  nodes: TechRelationNode[];
  edges: TechRelationEdge[];
}> {
  const listed = await db
    .prepare(
      `SELECT r.from_tech_id, r.to_tech_id, r.kind,
              f.name AS from_name, t.name AS to_name
       FROM tech_relations r
       JOIN techs f ON f.id = r.from_tech_id
       JOIN techs t ON t.id = r.to_tech_id
       ORDER BY f.name, t.name, r.kind`,
    )
    .all<{
      from_tech_id: string;
      to_tech_id: string;
      kind: RelationKind;
      from_name: string;
      to_name: string;
    }>();
  const nodes = new Map<string, string>();
  const edges: TechRelationEdge[] = [];
  for (const row of listed.results) {
    nodes.set(row.from_tech_id, row.from_name);
    nodes.set(row.to_tech_id, row.to_name);
    edges.push({
      fromId: row.from_tech_id,
      toId: row.to_tech_id,
      kind: row.kind,
    });
  }
  return {
    nodes: [...nodes.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "ja")),
    edges,
  };
}
