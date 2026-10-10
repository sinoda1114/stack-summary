import { classifyTech, type Classifier } from "../ai/classifier";
import type { NearTechDecision, NearTechQuery } from "../ai/clef-name-match";
import {
  InvalidModelOutput,
  type StructuredGenerator,
} from "../ai/model-output";
import { extractTechs } from "../ai/extract-techs";
import { splitMemos } from "../ai/split-memos";
import type { ExtractTechOutput } from "../ai/prompts/extract.v1";
import type { SplitMemoOutput } from "../ai/prompts/split.v1";
import {
  findImportById,
  updateImport,
  type ImportRecord,
} from "../db/imports";
import {
  replaceModelAnnotations,
} from "../db/model-annotations";
import { upsertSplitMemo, type SavedMemo } from "../db/memos";
import { upsertTag } from "../db/tags";
import {
  classifyTechRow,
  listCategories,
  listSubcategories,
  upsertAiSubcategory,
} from "../db/taxonomy";
import { aliasKey } from "../ingest/normalize";
import {
  chooseNearTechId,
  listAliasRows,
} from "../ingest/name-candidates";
import { resolveExtractedTech } from "../ingest/resolve-tech";

export const IMPORT_STEP_RETRY = {
  retries: {
    limit: 3,
    delay: "1 second",
    backoff: "exponential",
  },
} as const;

export type ImportRunner = {
  db: D1Database;
  generator: StructuredGenerator;
  modelLight: string;
  modelHeavy: string;
  now: string;
  classifier: Classifier;
  matchNear?: (input: NearTechQuery) => Promise<NearTechDecision>;
};

export async function markImportProcessing(
  runner: ImportRunner,
  importId: string,
): Promise<void> {
  await updateImport(runner.db, importId, {
    status: "processing",
    error: null,
    now: runner.now,
  });
}

export async function splitImport(
  runner: ImportRunner,
  importId: string,
): Promise<SplitMemoOutput> {
  const row = await requireImport(runner.db, importId);
  return splitMemos(runner.generator, {
    // 原文からメモの題、本文、日付を作るので、重いモデルを使う。
    model: runner.modelHeavy,
    text: row.rawText,
  });
}

export async function saveImportMemos(
  runner: ImportRunner,
  importId: string,
  split: SplitMemoOutput,
): Promise<SavedMemo[]> {
  const saved: SavedMemo[] = [];
  for (const memo of split.memos) {
    saved.push(
      await upsertSplitMemo(runner.db, {
        importId,
        title: memo.title,
        body: memo.body,
        memoDate: memo.memoDate,
        now: runner.now,
      }),
    );
  }
  return saved;
}

export async function extractSavedMemo(
  runner: ImportRunner,
  memo: SavedMemo,
): Promise<ExtractTechOutput> {
  return extractTechs(runner.generator, {
    // メモから技術名、関係、別名、タグを書くので、軽いモデルを使う。
    model: runner.modelLight,
    title: memo.title,
    body: memo.body,
  });
}

export async function applyExtractions(
  runner: ImportRunner,
  pairs: readonly { memo: SavedMemo; extracted: ExtractTechOutput }[],
): Promise<{
  techs: { techId: string; context: string }[];
  notes: string[];
}> {
  const notes: string[] = [];
  const replacements: Replacement[] = [];
  const aliasKeep = new Map<
    string,
    { memoId: string; aliases: Map<string, { key: string; label: string }> }
  >();
  const heldAliases = new Map<string, Map<string, { key: string; label: string }>>();
  const rows =
    runner.matchNear === undefined ? [] : await listAliasRows(runner.db);
  const techs: { techId: string; context: string }[] = [];
  for (const pair of pairs) {
    for (const tech of pair.extracted.techs) {
      const context = `${pair.memo.title}\n${pair.memo.body}`;
      const nearTechId =
        runner.matchNear === undefined || tech.relation === "mention"
          ? undefined
          : await chooseNearTechId(runner.db, {
              name: tech.name,
              aliases: tech.aliases,
              context,
              rows,
              match: runner.matchNear,
            });
      const resolved = await resolveExtractedTech(runner.db, {
        memoId: pair.memo.id,
        name: tech.name,
        aliases: tech.aliases,
        relation: tech.relation,
        now: runner.now,
        nearTechId,
      });
      if (resolved.discarded.length > 0) {
        notes.push(`捨てた候補: ${resolved.discarded.join(", ")}`);
      }
      if (resolved.kind === "conflict") {
        notes.push(`別名が複数の技術に分かれました: ${tech.name}`);
        continue;
      }
      if (resolved.kind !== "attached") {
        continue;
      }
      techs.push({ techId: resolved.techId, context });
      await rememberAliases(runner.db, resolved.techId, resolved.aliases, rows);
      const canonical =
        resolved.created ||
        (await canonicalTechName(runner.db, resolved.techId, tech.name));
      if (!canonical) {
        const bucket = heldAliases.get(resolved.techId) ?? new Map();
        for (const label of aliasLabels(tech.name, tech.aliases)) {
          bucket.set(label.key, label);
        }
        heldAliases.set(resolved.techId, bucket);
        continue;
      }
      const tagIds: string[] = [];
      for (const tag of tech.tags) {
        if (tag.name.trim().length === 0) {
          continue;
        }
        tagIds.push(
          await upsertTag(runner.db, { name: tag.name, kind: tag.kind }),
        );
      }
      const labels = aliasLabels(tech.name, tech.aliases);
      const kept = aliasKeep.get(resolved.techId) ?? {
        memoId: pair.memo.id,
        aliases: new Map<string, { key: string; label: string }>(),
      };
      for (const label of labels) {
        kept.aliases.set(label.key, label);
      }
      aliasKeep.set(resolved.techId, kept);
      replacements.push({
        memoId: pair.memo.id,
        techId: resolved.techId,
        aliases: labels,
        tagIds,
      });
    }
  }
  for (const [techId, aliases] of heldAliases) {
    const kept = aliasKeep.get(techId);
    if (kept === undefined) {
      continue;
    }
    for (const alias of aliases.values()) {
      kept.aliases.set(alias.key, alias);
    }
  }
  await replaceModelAnnotations(
    runner.db,
    [...aliasKeep.entries()].map(([techId, kept]) => ({
      memoId: kept.memoId,
      techId,
      aliases: [...kept.aliases.values()],
      tagIds: [],
    })),
    "aliases",
  );
  await replaceModelAnnotations(runner.db, replacements, "tags");
  return { techs, notes };
}

export async function classifyImportTechs(
  runner: ImportRunner,
  classifier: Classifier,
  techs: readonly { techId: string; context: string }[],
): Promise<void> {
  if (techs.length === 0) {
    return;
  }
  const categories = await listCategories(runner.db);
  const subcategories = await listSubcategories(runner.db);
  const seen = new Set<string>();
  for (const item of techs) {
    if (seen.has(item.techId)) {
      continue;
    }
    seen.add(item.techId);
    const tech = await runner.db
      .prepare("SELECT id, name, classified_by FROM techs WHERE id = ?")
      .bind(item.techId)
      .first<{ id: string; name: string; classified_by: string | null }>();
    if (tech === null || tech.classified_by === "user") {
      continue;
    }
    const accepted = await classifyTech(classifier, {
      tech: { name: tech.name, context: item.context },
      categories,
      subcategories,
    });
    const promptVersion = classifier.version;
    switch (accepted.kind) {
      case "existing":
        await classifyTechRow(runner.db, {
          techId: item.techId,
          subcategoryId: accepted.subcategoryId,
          classifiedBy: "model",
          promptVersion,
          now: runner.now,
        });
        break;
      case "new": {
        const subcategoryId = await upsertAiSubcategory(runner.db, {
          categoryId: accepted.categoryId,
          name: accepted.name,
          now: runner.now,
        });
        await classifyTechRow(runner.db, {
          techId: item.techId,
          subcategoryId,
          classifiedBy: "model",
          promptVersion,
          now: runner.now,
        });
        break;
      }
      case "unclassified":
        await classifyTechRow(runner.db, {
          techId: item.techId,
          subcategoryId: null,
          classifiedBy: null,
          promptVersion,
          now: runner.now,
        });
        break;
      default: {
        const unexpected: never = accepted;
        throw new Error(`未知の分類です: ${String(unexpected)}`);
      }
    }
  }
}

export async function finishImport(
  runner: ImportRunner,
  importId: string,
  input: { memoCount: number; skippedCount: number; notes: readonly string[] },
): Promise<void> {
  await updateImport(runner.db, importId, {
    status: "done",
    memoCount: input.memoCount,
    skippedCount: input.skippedCount,
    error: input.notes.length === 0 ? null : input.notes.join("\n"),
    now: runner.now,
  });
}

export async function failImport(
  runner: ImportRunner,
  importId: string,
  error: unknown,
): Promise<void> {
  await updateImport(runner.db, importId, {
    status: "failed",
    error: errorText(error),
    now: runner.now,
  });
}

type Replacement = {
  memoId: string;
  techId: string;
  aliases: { key: string; label: string }[];
  tagIds: string[];
};

async function canonicalTechName(
  db: D1Database,
  techId: string,
  name: string,
): Promise<boolean> {
  const key = aliasKey(name);
  if (key === null) {
    return false;
  }
  const row = await db
    .prepare("SELECT name_key FROM techs WHERE id = ?")
    .bind(techId)
    .first<{ name_key: string }>();
  return row !== null && row.name_key === key;
}

async function rememberAliases(
  db: D1Database,
  techId: string,
  aliases: readonly { key: string; label: string }[],
  rows: { id: string; name: string; alias: string; aliasKey: string }[],
): Promise<void> {
  if (aliases.length === 0) {
    return;
  }
  const tech = await db
    .prepare("SELECT name FROM techs WHERE id = ?")
    .bind(techId)
    .first<{ name: string }>();
  if (tech === null) {
    return;
  }
  for (const alias of aliases) {
    rows.push({
      id: techId,
      name: tech.name,
      alias: alias.label,
      aliasKey: alias.key,
    });
  }
}

function aliasLabels(
  name: string,
  aliases: readonly string[],
): { key: string; label: string }[] {
  const entries: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const label of [name, ...aliases]) {
    const key = aliasKey(label);
    if (key === null || seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push({ key, label });
  }
  return entries;
}

async function requireImport(
  db: D1Database,
  importId: string,
): Promise<ImportRecord> {
  const row = await findImportById(db, importId);
  if (row === null) {
    throw new Error("取り込みが見つかりません");
  }
  return row;
}

function errorText(error: unknown): string {
  const message =
    error instanceof InvalidModelOutput || error instanceof Error
      ? error.message
      : "取り込みに失敗しました";
  return message.slice(0, 500);
}
