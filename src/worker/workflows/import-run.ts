import { geminiClassifier } from "../ai/gemini-classifier";
import type { ExtractTechOutput } from "../ai/prompts/extract.v1";
import type { SavedMemo } from "../db/memos";
import {
  IMPORT_STEP_RETRY,
  applyExtractions,
  classifyImportTechs,
  extractSavedMemo,
  failImport,
  finishImport,
  markImportProcessing,
  saveImportMemos,
  splitImport,
  type ImportRunner,
} from "./import-steps";

export type ImportStepRunner = {
  do<T>(
    name: string,
    config: typeof IMPORT_STEP_RETRY,
    callback: () => Promise<T>,
  ): Promise<T>;
};

export async function executeImport(
  step: ImportStepRunner,
  runner: ImportRunner,
  importId: string,
): Promise<void> {
  try {
    await step.do("start", IMPORT_STEP_RETRY, async () => {
      await markImportProcessing(runner, importId);
    });
    const split = await step.do("split", IMPORT_STEP_RETRY, () =>
      splitImport(runner, importId),
    );
    const memos = await step.do("save", IMPORT_STEP_RETRY, () =>
      saveImportMemos(runner, importId, split),
    );
    const pairs: { memo: SavedMemo; extracted: ExtractTechOutput }[] = [];
    for (const memo of memos) {
      const extracted = await step.do(
        `extract:${memo.id}`,
        IMPORT_STEP_RETRY,
        () => extractSavedMemo(runner, memo),
      );
      pairs.push({ memo, extracted });
    }
    const applied = await step.do("resolve", IMPORT_STEP_RETRY, () =>
      applyExtractions(runner, pairs),
    );
    await step.do("classify", IMPORT_STEP_RETRY, () =>
      classifyImportTechs(
        runner,
        geminiClassifier(runner.generator, runner.model),
        applied.techs,
      ),
    );
    await step.do("finish", IMPORT_STEP_RETRY, async () => {
      await finishImport(runner, importId, {
        memoCount: memos.length,
        skippedCount: split.skippedCount,
        notes: applied.notes,
      });
    });
  } catch (error) {
    await step.do("fail", IMPORT_STEP_RETRY, async () => {
      await failImport(runner, importId, error);
    });
  }
}
