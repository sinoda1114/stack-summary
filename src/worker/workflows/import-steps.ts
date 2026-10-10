import { classifyTech, type Classifier } from "../ai/classifier";
import type { RelationJudge } from "../ai/relation-judge";
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
  relationJudge: RelationJudge;
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
  const folded = new Map<string, FoldedTech>();
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
      rememberAliases(resolved, rows);
      const fold = folded.get(resolved.techId) ?? {
        aliases: new Map<string, { key: string; label: string }>(),
        notes: [],
      };
      for (const label of aliasLabels(tech.name, tech.aliases)) {
        fold.aliases.set(label.key, label);
      }
      const incomingKey = aliasKey(tech.name);
      if (resolved.created || incomingKey === resolved.nameKey) {
        fold.notes.push({
          memoId: pair.memo.id,
          tagIds: await tagIdsFor(runner.db, tech.tags),
        });
      }
      folded.set(resolved.techId, fold);
    }
  }
  const replaced = [...folded.entries()].filter(([, fold]) => fold.notes.length > 0);
  await replaceModelAnnotations(
    runner.db,
    replaced.map(([techId, fold]) => ({
      memoId: fold.notes[0]?.memoId ?? "",
      techId,
      aliases: [...fold.aliases.values()],
      tagIds: [],
    })),
    "aliases",
  );
  await replaceModelAnnotations(
    runner.db,
    replaced.flatMap(([techId, fold]) =>
      fold.notes.map((note) => ({
        memoId: note.memoId,
        techId,
        aliases: [],
        tagIds: note.tagIds,
      })),
    ),
    "tags",
  );
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
      case "classified": {
        const subcategoryIds: string[] = [];
        for (const subcategory of accepted.subcategories) {
          switch (subcategory.kind) {
            case "existing":
              subcategoryIds.push(subcategory.subcategoryId);
              break;
            case "new": {
              const createdId = await upsertAiSubcategory(runner.db, {
                categoryId: accepted.categoryId,
                name: subcategory.name,
                now: runner.now,
              });
              subcategoryIds.push(createdId);
              if (!subcategories.some((row) => row.id === createdId)) {
                subcategories.push({
                  id: createdId,
                  categoryId: accepted.categoryId,
                  name: subcategory.name.trim(),
                  examples: [],
                });
              }
              break;
            }
            default: {
              const unexpected: never = subcategory;
              throw new Error(`未知の小分類です: ${String(unexpected)}`);
            }
          }
        }
        await classifyTechRow(runner.db, {
          techId: item.techId,
          categoryId: accepted.categoryId,
          subcategoryIds,
          classifiedBy: "model",
          promptVersion,
          now: runner.now,
        });
        break;
      }
      case "unclassified":
        await classifyTechRow(runner.db, {
          techId: item.techId,
          categoryId: null,
          subcategoryIds: [],
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

type FoldedTech = {
  aliases: Map<string, { key: string; label: string }>;
  notes: { memoId: string; tagIds: string[] }[];
};

async function tagIdsFor(
  db: D1Database,
  tags: readonly { name: string; kind: "topic" | "vendor" | "project" }[],
): Promise<string[]> {
  const tagIds: string[] = [];
  for (const tag of tags) {
    if (tag.name.trim().length === 0) {
      continue;
    }
    tagIds.push(await upsertTag(db, { name: tag.name, kind: tag.kind }));
  }
  return tagIds;
}

function rememberAliases(
  resolved: { techId: string; name: string; aliases: readonly { key: string; label: string }[] },
  rows: { id: string; name: string; alias: string; aliasKey: string }[],
): void {
  for (const alias of resolved.aliases) {
    rows.push({
      id: resolved.techId,
      name: resolved.name,
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
