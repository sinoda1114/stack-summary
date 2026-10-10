import { aliasKey } from "./normalize";

export type TechRelation = "subject" | "comparison";

export type ExtractedRelation = TechRelation | "mention";

export type ResolveExtractedTechInput = {
  memoId: string;
  name: string;
  aliases: readonly string[];
  relation: ExtractedRelation;
  now: string;
  nearTechId?: string;
};

export type ResolveExtractedTechResult =
  | {
      kind: "attached";
      techId: string;
      relation: TechRelation;
      created: boolean;
      near: boolean;
      name: string;
      nameKey: string;
      discarded: readonly string[];
      aliases: readonly AliasEntry[];
    }
  | {
      kind: "mention";
      name: string;
      discarded: readonly string[];
    }
  | {
      kind: "discarded";
      discarded: readonly string[];
    }
  | {
      kind: "conflict";
      techIds: readonly string[];
      discarded: readonly string[];
    };

export type TechResolutionPlan =
  | { kind: "discarded" }
  | { kind: "conflict"; techIds: readonly string[] }
  | { kind: "create"; aliasesToInsert: readonly AliasEntry[] }
  | {
      kind: "attach";
      techId: string;
      aliasesToInsert: readonly AliasEntry[];
    };

export type AliasEntry = {
  key: string;
  label: string;
};

export function planTechResolution(
  entries: readonly AliasEntry[],
  hits: ReadonlyMap<string, string>,
): TechResolutionPlan {
  if (entries.length === 0) {
    return { kind: "discarded" };
  }
  const techIds: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const techId = hits.get(entry.key);
    if (techId === undefined || seen.has(techId)) {
      continue;
    }
    seen.add(techId);
    techIds.push(techId);
  }
  if (techIds.length > 1) {
    return { kind: "conflict", techIds };
  }
  const aliasesToInsert = entries.filter((entry) => !hits.has(entry.key));
  const techId = techIds[0];
  if (techId === undefined) {
    return { kind: "create", aliasesToInsert };
  }
  return { kind: "attach", techId, aliasesToInsert };
}

export async function previewExtractedAliases(
  db: D1Database,
  name: string,
  aliases: readonly string[],
): Promise<{
  entries: AliasEntry[];
  discarded: string[];
  plan: TechResolutionPlan;
}> {
  const partitioned = partitionAliases(name, aliases);
  const hits = await aliasHits(
    db,
    partitioned.entries.map((entry) => entry.key),
  );
  return {
    entries: partitioned.entries,
    discarded: partitioned.discarded,
    plan: planTechResolution(partitioned.entries, hits),
  };
}

export async function resolveExtractedTech(
  db: D1Database,
  input: ResolveExtractedTechInput,
): Promise<ResolveExtractedTechResult> {
  const { entries, discarded } = partitionAliases(input.name, input.aliases);
  switch (input.relation) {
    case "mention":
      return recordMention(db, input.memoId, input.name, discarded);
    case "subject":
    case "comparison":
      return attachTech(
        db,
        {
          memoId: input.memoId,
          name: input.name,
          now: input.now,
          relation: input.relation,
          nearTechId: input.nearTechId,
        },
        entries,
        discarded,
      );
    default: {
      const unexpected: never = input.relation;
      throw new Error(`未知の関係です: ${String(unexpected)}`);
    }
  }
}

function partitionAliases(
  name: string,
  aliases: readonly string[],
): { entries: AliasEntry[]; discarded: string[] } {
  const discarded: string[] = [];
  const entries: AliasEntry[] = [];
  const seen = new Set<string>();
  for (const label of [name, ...aliases]) {
    const key = aliasKey(label);
    if (key === null) {
      discarded.push(label);
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push({ key, label });
  }
  return { entries, discarded };
}

async function recordMention(
  db: D1Database,
  memoId: string,
  name: string,
  discarded: readonly string[],
): Promise<ResolveExtractedTechResult> {
  if (aliasKey(name) === null) {
    return { kind: "discarded", discarded };
  }
  await db
    .prepare(
      `INSERT INTO memo_mentions (memo_id, name)
       VALUES (?, ?)
       ON CONFLICT(memo_id, name) DO NOTHING`,
    )
    .bind(memoId, name)
    .run();
  return { kind: "mention", name, discarded };
}

export const CLAIM_ATTEMPTS = 3;

async function attachTech(
  db: D1Database,
  input: {
    memoId: string;
    name: string;
    now: string;
    relation: TechRelation;
    nearTechId?: string;
  },
  entries: readonly AliasEntry[],
  discarded: readonly string[],
): Promise<ResolveExtractedTechResult> {
  const nameKey = aliasKey(input.name);
  const canonical = entries[0];
  if (nameKey === null || canonical === undefined || canonical.key !== nameKey) {
    return { kind: "discarded", discarded };
  }

  // 読みと書きは別々なので、同時の作成は一意制約に負けた側を戻してから照合し直す。
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const hits = await aliasHits(
      db,
      entries.map((entry) => entry.key),
    );
    const plan = planTechResolution(entries, hits);
    switch (plan.kind) {
      case "discarded":
        return { kind: "discarded", discarded };
      case "conflict":
        return { kind: "conflict", techIds: plan.techIds, discarded };
      case "create":
      case "attach": {
        const planned = pinNearTech(plan, input.nearTechId);
        const attached = await commitAttachment(db, {
          memoId: input.memoId,
          now: input.now,
          relation: input.relation,
          canonical,
          plan: planned,
          discarded,
        });
        if (attached !== null && attached.kind === "attached") {
          return {
            ...attached,
            near: plan.kind === "create" && planned.kind === "attach",
          };
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

function pinNearTech(
  plan: Extract<TechResolutionPlan, { kind: "create" | "attach" }>,
  nearTechId: string | undefined,
): Extract<TechResolutionPlan, { kind: "create" | "attach" }> {
  if (plan.kind !== "create" || nearTechId === undefined) {
    return plan;
  }
  return {
    kind: "attach",
    techId: nearTechId,
    aliasesToInsert: plan.aliasesToInsert,
  };
}

async function commitAttachment(
  db: D1Database,
  input: {
    memoId: string;
    now: string;
    relation: TechRelation;
    canonical: AliasEntry;
    plan: Extract<TechResolutionPlan, { kind: "create" | "attach" }>;
    discarded: readonly string[];
  },
): Promise<ResolveExtractedTechResult | null> {
  const techId =
    input.plan.kind === "create" ? crypto.randomUUID() : input.plan.techId;
  try {
    await db.batch([
      ...(input.plan.kind === "create"
        ? [claimTechInsert(db, techId, input.canonical, input.now)]
        : []),
      ...input.plan.aliasesToInsert.map((entry) =>
        claimAliasInsert(db, entry, techId),
      ),
      linkInsert(db, input.memoId, techId, input.relation),
    ]);
  } catch (error) {
    if (!isLostClaim(error)) {
      throw error;
    }
    return null;
  }
  const named = await db
    .prepare("SELECT name, name_key FROM techs WHERE id = ?")
    .bind(techId)
    .first<{ name: string; name_key: string }>();
  if (named === null) {
    return null;
  }
  return {
    kind: "attached",
    techId,
    name: named.name,
    nameKey: named.name_key,
    relation: await storedRelation(db, input.memoId, techId),
    created: input.plan.kind === "create",
    near: false,
    discarded: input.discarded,
    aliases: input.plan.aliasesToInsert,
  };
}

async function aliasHits(
  db: D1Database,
  keys: readonly string[],
): Promise<Map<string, string>> {
  const hits = new Map<string, string>();
  if (keys.length === 0) {
    return hits;
  }
  const placeholders = keys.map(() => "?").join(", ");
  const listed = await db
    .prepare(
      `SELECT alias_key, tech_id
       FROM tech_aliases
       WHERE alias_key IN (${placeholders})`,
    )
    .bind(...keys)
    .all<{ alias_key: string; tech_id: string }>();
  for (const row of listed.results) {
    hits.set(row.alias_key, row.tech_id);
  }
  return hits;
}

export async function storedRelation(
  db: D1Database,
  memoId: string,
  techId: string,
): Promise<TechRelation> {
  const row = await db
    .prepare(
      "SELECT relation FROM memo_techs WHERE memo_id = ? AND tech_id = ?",
    )
    .bind(memoId, techId)
    .first<{ relation: string }>();
  if (row?.relation === "subject" || row?.relation === "comparison") {
    return row.relation;
  }
  throw new Error("メモと技術の関係を読めませんでした");
}

export function claimTechInsert(
  db: D1Database,
  techId: string,
  entry: AliasEntry,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO techs (
         id, name, name_key, status, status_by, created_at, updated_at
       ) VALUES (?, ?, ?, 'unrated', 'model', ?, ?)`,
    )
    .bind(techId, entry.label, entry.key, now, now);
}

export function claimAliasInsert(
  db: D1Database,
  entry: AliasEntry,
  techId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
       VALUES (?, ?, ?, 'model')`,
    )
    .bind(entry.key, entry.label, techId);
}

export function isLostClaim(error: unknown): boolean {
  const text = errorText(error);
  return (
    text.includes("UNIQUE constraint failed: techs.name_key") ||
    text.includes("UNIQUE constraint failed: tech_aliases.alias_key")
  );
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }
  const cause = error.cause;
  const nested = cause instanceof Error ? cause.message : "";
  return `${error.message}\n${nested}`;
}

export function linkInsert(
  db: D1Database,
  memoId: string,
  techId: string,
  relation: TechRelation,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO memo_techs (memo_id, tech_id, relation)
       VALUES (?, ?, ?)
       ON CONFLICT(memo_id, tech_id) DO NOTHING`,
    )
    .bind(memoId, techId, relation);
}
