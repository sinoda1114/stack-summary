import type { EvalScoreInput } from "./eval-file";

export const PROVISIONAL_CATEGORY_TARGET = 0.9;
export const PROVISIONAL_SUBCATEGORY_TARGET = 0.8;

export type ClassificationScore = {
  scored: number;
  unscored: number;
  categoryHits: number;
  subcategoryHits: number;
  categoryRate: number;
  subcategoryRate: number;
  meetsProvisionalTargets: boolean;
};

export function scoreClassification(
  samples: readonly EvalScoreInput[],
): ClassificationScore {
  let categoryHits = 0;
  let subcategoryHits = 0;
  let scored = 0;
  let unscored = 0;
  for (const sample of samples) {
    if (sample.predicted === undefined) {
      unscored += 1;
      continue;
    }
    scored += 1;
    if (sample.predicted.categoryId === sample.expected.categoryId) {
      categoryHits += 1;
    }
    if (sample.predicted.subcategoryId === sample.expected.subcategoryId) {
      subcategoryHits += 1;
    }
  }
  const categoryRate = scored === 0 ? 0 : categoryHits / scored;
  const subcategoryRate = scored === 0 ? 0 : subcategoryHits / scored;
  return {
    scored,
    unscored,
    categoryHits,
    subcategoryHits,
    categoryRate,
    subcategoryRate,
    meetsProvisionalTargets:
      scored > 0 &&
      categoryRate >= PROVISIONAL_CATEGORY_TARGET &&
      subcategoryRate >= PROVISIONAL_SUBCATEGORY_TARGET,
  };
}
