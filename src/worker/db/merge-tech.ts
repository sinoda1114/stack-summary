import { aliasKey } from "../ingest/normalize";

export type MergeFailure = "self_merge" | "not_found" | "reason_conflict";

type TechRow = {
  id: string;
  name: string;
  name_key: string;
  subcategory_id: string | null;
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
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE techs
         SET subcategory_id = ?,
             classified_by = ?,
             reason = ?,
             reason_by = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        into.subcategory_id,
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

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

async function loadTech(db: D1Database, id: string): Promise<TechRow | null> {
  return db
    .prepare(
      `SELECT id, name, name_key, subcategory_id, classified_by, reason, reason_by
       FROM techs WHERE id = ?`,
    )
    .bind(id)
    .first<TechRow>();
}
