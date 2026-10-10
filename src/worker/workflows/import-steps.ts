import { CLASSIFY_PROMPT_VERSION, classifyTech } from "../ai/gemini-classifier";
import type { Classifier } from "../ai/classifier";
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
  for (const pair of pairs) {
    for (const tech of pair.extracted.techs) {
      const resolved = await resolveExtractedTech(runner.db, {
        memoId: pair.memo.id,
        name: tech.name,
        aliases: tech.aliases,
        relation: tech.relation,
        now: runner.now,
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
  return {
    techs: replacements.map((item) => ({
      techId: item.techId,
      context: contextFor(item.memoId, pairs),
    })),
    notes,
  };
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
    switch (accepted.kind) {
      case "existing":
        await classifyTechRow(runner.db, {
          techId: item.techId,
          subcategoryId: accepted.subcategoryId,
          classifiedBy: "model",
          promptVersion: CLASSIFY_PROMPT_VERSION,
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
          promptVersion: CLASSIFY_PROMPT_VERSION,
          now: runner.now,
        });
        break;
      }
      case "unclassified":
        await classifyTechRow(runner.db, {
          techId: item.techId,
          subcategoryId: null,
          classifiedBy: null,
          promptVersion: CLASSIFY_PROMPT_VERSION,
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

function contextFor(
  memoId: string,
  pairs: readonly { memo: SavedMemo; extracted: ExtractTechOutput }[],
): string {
  const memo = pairs.find((pair) => pair.memo.id === memoId)?.memo;
  if (memo === undefined) {
    return "";
  }
  return `${memo.title}\n${memo.body}`;
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
