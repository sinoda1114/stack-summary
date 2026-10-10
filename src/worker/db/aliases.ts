import { aliasKey } from "../ingest/normalize";

export type AliasFailure = "not_found" | "invalid" | "alias_taken" | "name_key";

export async function addUserAlias(
  db: D1Database,
  techId: string,
  label: string,
): Promise<{ ok: true; key: string } | { ok: false; code: AliasFailure }> {
  const key = aliasKey(label);
  if (key === null) {
    return { ok: false, code: "invalid" };
  }
  const tech = await db
    .prepare("SELECT id FROM techs WHERE id = ?")
    .bind(techId)
    .first<{ id: string }>();
  if (tech === null) {
    return { ok: false, code: "not_found" };
  }
  const existing = await db
    .prepare("SELECT tech_id FROM tech_aliases WHERE alias_key = ?")
    .bind(key)
    .first<{ tech_id: string }>();
  if (existing !== null && existing.tech_id !== techId) {
    return { ok: false, code: "alias_taken" };
  }
  if (existing === null) {
    await db
      .prepare(
        `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
         VALUES (?, ?, ?, 'user')`,
      )
      .bind(key, label.trim(), techId)
      .run();
  }
  return { ok: true, key };
}

export async function deleteUserAlias(
  db: D1Database,
  techId: string,
  key: string,
): Promise<{ ok: true } | { ok: false; code: AliasFailure }> {
  const tech = await db
    .prepare("SELECT name_key FROM techs WHERE id = ?")
    .bind(techId)
    .first<{ name_key: string }>();
  if (tech === null) {
    return { ok: false, code: "not_found" };
  }
  if (tech.name_key === key) {
    return { ok: false, code: "name_key" };
  }
  const deleted = await db
    .prepare("DELETE FROM tech_aliases WHERE tech_id = ? AND alias_key = ?")
    .bind(techId, key)
    .run();
  if (deleted.meta.changes === 0) {
    return { ok: false, code: "not_found" };
  }
  return { ok: true };
}
