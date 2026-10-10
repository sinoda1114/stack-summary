import { resolveExtractedTech } from "../ingest/resolve-tech";
import { insertModelAliases } from "./model-annotations";

export type PromoteFailure = "not_found" | "conflict" | "invalid";

export async function promoteMention(
  db: D1Database,
  input: { memoId: string; name: string; now: string },
): Promise<
  | { ok: true; techId: string; relation: "subject" | "comparison" }
  | { ok: false; code: PromoteFailure }
> {
  const mention = await db
    .prepare("SELECT name FROM memo_mentions WHERE memo_id = ? AND name = ?")
    .bind(input.memoId, input.name)
    .first<{ name: string }>();
  if (mention === null) {
    return { ok: false, code: "not_found" };
  }
  const resolved = await resolveExtractedTech(db, {
    memoId: input.memoId,
    name: input.name,
    aliases: [],
    relation: "subject",
    now: input.now,
  });
  if (resolved.kind === "conflict") {
    return { ok: false, code: "conflict" };
  }
  if (resolved.kind !== "attached") {
    return { ok: false, code: "invalid" };
  }
  await insertModelAliases(db, resolved.techId, resolved.aliases);
  await db
    .prepare("DELETE FROM memo_mentions WHERE memo_id = ? AND name = ?")
    .bind(input.memoId, input.name)
    .run();
  return { ok: true, techId: resolved.techId, relation: resolved.relation };
}
