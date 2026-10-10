import { aliasKey } from "../ingest/normalize";
import {
  linkInsert,
  planTechResolution,
  storedRelation,
  createTech,
  type TechRelation,
} from "../ingest/resolve-tech";
import { aliasInsert } from "./model-annotations";

export type PromoteFailure = "not_found" | "conflict" | "invalid";

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
    case "attach":
      return writePromotion(db, input, plan.techId, plan.aliasesToInsert);
    case "create": {
      const created = await createTech(db, entry, input.now);
      return writePromotion(db, input, created.techId, plan.aliasesToInsert);
    }
    default: {
      const unexpected: never = plan;
      throw new Error(`未知の照合です: ${String(unexpected)}`);
    }
  }
}

async function writePromotion(
  db: D1Database,
  input: { memoId: string; name: string },
  techId: string,
  aliases: readonly { key: string; label: string }[],
): Promise<{ ok: true; techId: string; relation: TechRelation }> {
  await db.batch([
    ...aliases.map((alias) => aliasInsert(db, techId, alias)),
    linkInsert(db, input.memoId, techId, "subject"),
    deleteMention(db, input.memoId, input.name),
  ]);
  return {
    ok: true,
    techId,
    relation: await storedRelation(db, input.memoId, techId),
  };
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
