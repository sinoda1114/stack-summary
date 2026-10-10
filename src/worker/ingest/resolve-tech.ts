import { aliasKey } from "./normalize";

export type TechRelation = "subject" | "comparison";

export type ExtractedRelation = TechRelation | "mention";

export type ResolveExtractedTechInput = {
  memoId: string;
  name: string;
  aliases: readonly string[];
  relation: ExtractedRelation;
  now: string;
};

export type ResolveExtractedTechResult =
  | {
      kind: "attached";
      techId: string;
      relation: TechRelation;
      created: boolean;
      discarded: readonly string[];
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

async function attachTech(
  db: D1Database,
  input: {
    memoId: string;
    name: string;
    now: string;
    relation: TechRelation;
  },
  entries: readonly AliasEntry[],
  discarded: readonly string[],
): Promise<ResolveExtractedTechResult> {
  const nameKey = aliasKey(input.name);
  const canonical = entries[0];
  if (nameKey === null || canonical === undefined || canonical.key !== nameKey) {
    return { kind: "discarded", discarded };
  }

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
    case "create": {
      const createdTech = await createTech(db, canonical, input.now);
      return finishAttachment(db, {
        memoId: input.memoId,
        techId: createdTech.techId,
        created: createdTech.created,
        relation: input.relation,
        aliasesToInsert: plan.aliasesToInsert,
        discarded,
      });
    }
    case "attach":
      return finishAttachment(db, {
        memoId: input.memoId,
        techId: plan.techId,
        created: false,
        relation: input.relation,
        aliasesToInsert: plan.aliasesToInsert,
        discarded,
      });
    default: {
      const unexpected: never = plan;
      throw new Error(`未知の照合です: ${String(unexpected)}`);
    }
  }
}

async function finishAttachment(
  db: D1Database,
  input: {
    memoId: string;
    techId: string;
    created: boolean;
    relation: TechRelation;
    aliasesToInsert: readonly AliasEntry[];
    discarded: readonly string[];
  },
): Promise<ResolveExtractedTechResult> {
  await db.batch([
    ...input.aliasesToInsert.map((entry) =>
      aliasInsert(db, entry, input.techId),
    ),
    linkInsert(db, input.memoId, input.techId, input.relation),
  ]);
  return {
    kind: "attached",
    techId: input.techId,
    relation: await storedRelation(db, input.memoId, input.techId),
    created: input.created,
    discarded: input.discarded,
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

async function storedRelation(
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

async function createTech(
  db: D1Database,
  entry: AliasEntry,
  now: string,
): Promise<{ techId: string; created: boolean }> {
  const id = crypto.randomUUID();
  const inserted = await db
    .prepare(
      `INSERT INTO techs (
         id, name, name_key, subcategory_id, status, status_by, created_at, updated_at
       ) VALUES (?, ?, ?, NULL, 'unrated', 'model', ?, ?)
       ON CONFLICT(name_key) DO NOTHING`,
    )
    .bind(id, entry.label, entry.key, now, now)
    .run();
  const row = await db
    .prepare("SELECT id FROM techs WHERE name_key = ?")
    .bind(entry.key)
    .first<{ id: string }>();
  if (row === null) {
    throw new Error("技術を作成できませんでした");
  }
  return {
    techId: row.id,
    created: inserted.meta.changes === 1 && row.id === id,
  };
}

function aliasInsert(
  db: D1Database,
  entry: AliasEntry,
  techId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO tech_aliases (alias_key, alias, tech_id, source)
       VALUES (?, ?, ?, 'model')
       ON CONFLICT(alias_key) DO NOTHING`,
    )
    .bind(entry.key, entry.label, techId);
}

function linkInsert(
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
