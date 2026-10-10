import { aliasKey } from "../ingest/normalize";
import {
  CLAIM_ATTEMPTS,
  claimAliasInsert,
  claimTechInsert,
  isLostClaim,
  linkInsert,
  planTechResolution,
  storedRelation,
  type AliasEntry,
  type TechRelation,
  type TechResolutionPlan,
} from "../ingest/resolve-tech";

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
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const hits = await aliasHits(db, key);
    const plan = planTechResolution([entry], hits);
    switch (plan.kind) {
      case "discarded":
        return { ok: false, code: "invalid" };
      case "conflict":
        return { ok: false, code: "conflict" };
      case "attach":
      case "create": {
        const promoted = await writePromotion(db, input, entry, plan);
        if (promoted !== null) {
          return promoted;
        }
        break;
      }
      default: {
        const unexpected: never = plan;
        throw new Error(`未知の照合です: ${String(unexpected)}`);
      }
    }
  }
  throw new Error("別名の照合を確定できませんでした");
}

async function writePromotion(
  db: D1Database,
  input: { memoId: string; name: string; now: string },
  entry: AliasEntry,
  plan: Extract<TechResolutionPlan, { kind: "create" | "attach" }>,
): Promise<{ ok: true; techId: string; relation: TechRelation } | null> {
  const techId = plan.kind === "create" ? crypto.randomUUID() : plan.techId;
  try {
    await db.batch([
      ...(plan.kind === "create"
        ? [claimTechInsert(db, techId, entry, input.now)]
        : []),
      ...plan.aliasesToInsert.map((alias) =>
        claimAliasInsert(db, alias, techId),
      ),
      linkInsert(db, input.memoId, techId, "subject"),
      deleteMention(db, input.memoId, input.name),
    ]);
  } catch (error) {
    if (!isLostClaim(error)) {
      throw error;
    }
    return null;
  }
  return {
    ok: true,
    techId,
    relation: await storedRelation(db, input.memoId, techId),
  };
}

async function aliasHits(
  db: D1Database,
  key: string,
): Promise<Map<string, string>> {
  const existing = await db
    .prepare("SELECT tech_id FROM tech_aliases WHERE alias_key = ?")
    .bind(key)
    .first<{ tech_id: string }>();
  const hits = new Map<string, string>();
  if (existing !== null) {
    hits.set(key, existing.tech_id);
  }
  return hits;
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
