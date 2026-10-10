import type { RelationKind } from "../../shared/relations";
import { aliasKey } from "../ingest/normalize";
import { relationPairKey } from "./tech-relations";

export type MergeFailure = "self_merge" | "not_found" | "reason_conflict";

type TechRow = {
  id: string;
  name: string;
  name_key: string;
  category_id: string | null;
  classified_by: string | null;
  reason: string | null;
  reason_by: string | null;
};

export async function mergeTech(
  db: D1Database,
  input: {
    sourceId: string;
    intoId: string;
    reasonChoice?: "into" | "source";
    now: string;
  },
): Promise<{ ok: true } | { ok: false; code: MergeFailure }> {
  if (input.sourceId === input.intoId) {
    return { ok: false, code: "self_merge" };
  }
  const into = await loadTech(db, input.intoId);
  const source = await loadTech(db, input.sourceId);
  if (into === null || source === null) {
    return { ok: false, code: "not_found" };
  }
  const reason = chosenReason(source, into, input.reasonChoice);
  if (reason === null) {
    return { ok: false, code: "reason_conflict" };
  }
  const movedRelations = await relationsToMove(db, source.id, into.id);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE techs
         SET category_id = ?,
             classified_by = ?,
             reason = ?,
             reason_by = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        into.category_id,
        into.classified_by,
        reason.reason,
        reason.reasonBy,
        input.now,
        into.id,
      ),
    db
      .prepare(
        `DELETE FROM tech_tags
         WHERE tech_id = ?
           AND tag_id IN (SELECT tag_id FROM tech_tags WHERE tech_id = ?)`,
      )
      .bind(source.id, into.id),
    db
      .prepare("UPDATE tech_tags SET tech_id = ? WHERE tech_id = ?")
      .bind(into.id, source.id),
    db
      .prepare(
        `DELETE FROM memo_techs
         WHERE tech_id = ?
           AND memo_id IN (SELECT memo_id FROM memo_techs WHERE tech_id = ?)`,
      )
      .bind(source.id, into.id),
    db
      .prepare("UPDATE memo_techs SET tech_id = ? WHERE tech_id = ?")
      .bind(into.id, source.id),
    db
      .prepare("UPDATE tech_aliases SET tech_id = ? WHERE tech_id = ?")
      .bind(into.id, source.id),
  ];
  const nameKey = aliasKey(source.name);
  if (nameKey !== null) {
    statements.push(
      db
        .prepare(
          `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
           VALUES (?, ?, ?, 'user')
           ON CONFLICT(alias_key) DO UPDATE SET
             tech_id = excluded.tech_id,
             alias = excluded.alias,
             source = 'user'`,
        )
        .bind(nameKey, source.name, into.id),
    );
  }
  statements.push(
    db
      .prepare(
        `DELETE FROM tech_relations
         WHERE from_tech_id = ? OR to_tech_id = ?`,
      )
      .bind(source.id, source.id),
  );
  for (const relation of movedRelations) {
    statements.push(
      db
        .prepare(
          `INSERT INTO tech_relations (from_tech_id, to_tech_id, kind)
           VALUES (?, ?, ?)`,
        )
        .bind(relation.fromTechId, relation.toTechId, relation.kind),
    );
  }
  statements.push(db.prepare("DELETE FROM techs WHERE id = ?").bind(source.id));
  await db.batch(statements);
  return { ok: true };
}

function chosenReason(
  source: TechRow,
  into: TechRow,
  choice: "into" | "source" | undefined,
): { reason: string | null; reasonBy: string | null } | null {
  const sourceHas = hasText(source.reason);
  const intoHas = hasText(into.reason);
  if (sourceHas && intoHas) {
    if (choice === "into") {
      return { reason: into.reason, reasonBy: into.reason_by };
    }
    if (choice === "source") {
      return { reason: source.reason, reasonBy: source.reason_by };
    }
    return null;
  }
  if (sourceHas) {
    return { reason: source.reason, reasonBy: source.reason_by };
  }
  return { reason: into.reason, reasonBy: into.reason_by };
}

async function relationsToMove(
  db: D1Database,
  sourceId: string,
  intoId: string,
): Promise<{ fromTechId: string; toTechId: string; kind: RelationKind }[]> {
  const sourceRows = await db
    .prepare(
      `SELECT from_tech_id, to_tech_id, kind FROM tech_relations
       WHERE from_tech_id = ? OR to_tech_id = ?`,
    )
    .bind(sourceId, sourceId)
    .all<{ from_tech_id: string; to_tech_id: string; kind: RelationKind }>();
  const intoRows = await db
    .prepare(
      `SELECT from_tech_id, to_tech_id FROM tech_relations
       WHERE from_tech_id = ? OR to_tech_id = ?`,
    )
    .bind(intoId, intoId)
    .all<{ from_tech_id: string; to_tech_id: string }>();
  const occupied = new Set<string>();
  for (const row of intoRows.results) {
    if (row.from_tech_id === sourceId || row.to_tech_id === sourceId) {
      continue;
    }
    occupied.add(relationPairKey(row.from_tech_id, row.to_tech_id));
  }
  const moved: { fromTechId: string; toTechId: string; kind: RelationKind }[] = [];
  for (const row of sourceRows.results) {
    const fromTechId = row.from_tech_id === sourceId ? intoId : row.from_tech_id;
    const toTechId = row.to_tech_id === sourceId ? intoId : row.to_tech_id;
    if (fromTechId === toTechId) {
      continue;
    }
    const key = relationPairKey(fromTechId, toTechId);
    if (occupied.has(key)) {
      continue;
    }
    occupied.add(key);
    moved.push({ fromTechId, toTechId, kind: row.kind });
  }
  return moved;
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

async function loadTech(db: D1Database, id: string): Promise<TechRow | null> {
  return db
    .prepare(
      `SELECT id, name, name_key, category_id, classified_by, reason, reason_by
       FROM techs WHERE id = ?`,
    )
    .bind(id)
    .first<TechRow>();
}
