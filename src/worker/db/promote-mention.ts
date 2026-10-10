import { aliasKey } from "../ingest/normalize";
import { planTechResolution, type TechRelation } from "../ingest/resolve-tech";

export type PromoteFailure = "not_found" | "conflict" | "invalid";

type AliasEntry = { key: string; label: string };

export async function promoteMention(
  db: D1Database,
  input: { memoId: string; name: string; now: string },
): Promise<
  | { ok: true; techId: string; relation: TechRelation }
  | { ok: false; code: PromoteFailure }
> {
  const mention = await db
    .prepare("SELECT name FROM memo_mentions WHERE memo_id = ? AND name = ?")
    .bind(input.memoId, input.name)
    .first<{ name: string }>();
  if (mention === null) {
    return { ok: false, code: "not_found" };
  }
  const key = aliasKey(input.name);
  if (key === null) {
    return { ok: false, code: "invalid" };
  }
  const entry = { key, label: input.name };
  const existing = await db
    .prepare("SELECT tech_id FROM tech_aliases WHERE alias_key = ?")
    .bind(key)
    .first<{ tech_id: string }>();
  const hits = new Map<string, string>();
  if (existing !== null) {
    hits.set(key, existing.tech_id);
  }
  const plan = planTechResolution([entry], hits);
  switch (plan.kind) {
    case "discarded":
      return { ok: false, code: "invalid" };
    case "conflict":
      return { ok: false, code: "conflict" };
    case "create":
      await db.batch(createStatements(db, input, entry, plan.aliasesToInsert));
      return readPromotion(db, input.memoId, key);
    case "attach":
      await db.batch(attachStatements(db, input, plan.techId, plan.aliasesToInsert));
      return readPromotion(db, input.memoId, key);
    default: {
      const unexpected: never = plan;
      throw new Error(`未知の照合です: ${String(unexpected)}`);
    }
  }
}

function createStatements(
  db: D1Database,
  input: { memoId: string; name: string; now: string },
  entry: AliasEntry,
  aliases: readonly AliasEntry[],
): D1PreparedStatement[] {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO techs (
           id, name, name_key, subcategory_id, status, status_by, created_at, updated_at
         ) VALUES (?, ?, ?, NULL, 'unrated', 'model', ?, ?)
         ON CONFLICT(name_key) DO NOTHING`,
      )
      .bind(id, entry.label, entry.key, input.now, input.now),
    ...aliases.map((alias) => aliasByNameKey(db, alias, entry.key)),
    linkByNameKey(db, input.memoId, entry.key),
    deleteMention(db, input.memoId, input.name),
  ];
}

function attachStatements(
  db: D1Database,
  input: { memoId: string; name: string },
  techId: string,
  aliases: readonly AliasEntry[],
): D1PreparedStatement[] {
  return [
    ...aliases.map((alias) => aliasForTech(db, alias, techId)),
    db
      .prepare(
        `INSERT INTO memo_techs (memo_id, tech_id, relation)
         VALUES (?, ?, 'subject')
         ON CONFLICT(memo_id, tech_id) DO NOTHING`,
      )
      .bind(input.memoId, techId),
    deleteMention(db, input.memoId, input.name),
  ];
}

function aliasByNameKey(
  db: D1Database,
  alias: AliasEntry,
  nameKey: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
       VALUES (?, ?, (SELECT id FROM techs WHERE name_key = ?), 'model')
       ON CONFLICT(alias_key) DO NOTHING`,
    )
    .bind(alias.key, alias.label, nameKey);
}

function aliasForTech(
  db: D1Database,
  alias: AliasEntry,
  techId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
       VALUES (?, ?, ?, 'model')
       ON CONFLICT(alias_key) DO NOTHING`,
    )
    .bind(alias.key, alias.label, techId);
}

function linkByNameKey(
  db: D1Database,
  memoId: string,
  nameKey: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO memo_techs (memo_id, tech_id, relation)
       SELECT ?, id, 'subject' FROM techs WHERE name_key = ?
       ON CONFLICT(memo_id, tech_id) DO NOTHING`,
    )
    .bind(memoId, nameKey);
}

function deleteMention(
  db: D1Database,
  memoId: string,
  name: string,
): D1PreparedStatement {
  return db
    .prepare("DELETE FROM memo_mentions WHERE memo_id = ? AND name = ?")
    .bind(memoId, name);
}

async function readPromotion(
  db: D1Database,
  memoId: string,
  nameKey: string,
): Promise<
  | { ok: true; techId: string; relation: TechRelation }
  | { ok: false; code: PromoteFailure }
> {
  const tech = await db
    .prepare("SELECT id FROM techs WHERE name_key = ?")
    .bind(nameKey)
    .first<{ id: string }>();
  if (tech === null) {
    return { ok: false, code: "invalid" };
  }
  const link = await db
    .prepare("SELECT relation FROM memo_techs WHERE memo_id = ? AND tech_id = ?")
    .bind(memoId, tech.id)
    .first<{ relation: string }>();
  if (link?.relation !== "subject" && link?.relation !== "comparison") {
    return { ok: false, code: "invalid" };
  }
  return { ok: true, techId: tech.id, relation: link.relation };
}
