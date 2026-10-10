export const PROVISIONAL_CATEGORY_TARGET = 0.9;
export const PROVISIONAL_SUBCATEGORY_TARGET = 0.8;

export type EvalLabel = {
  categoryId: string | null;
  subcategoryId: string | null;
};

export type EvalSample = {
  name: string;
  context: string;
  expected: {
    categoryId: string;
    subcategoryId: string | null;
  };
  predicted?: EvalLabel;
};

export type ClassificationScore = {
  scored: number;
  unscored: number;
  categoryHits: number;
  subcategoryHits: number;
  categoryRate: number;
  subcategoryRate: number;
  provisionalCategoryTarget: number;
  provisionalSubcategoryTarget: number;
  meetsProvisionalTargets: boolean;
};

export function scoreClassification(
  samples: readonly EvalSample[],
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
    provisionalCategoryTarget: PROVISIONAL_CATEGORY_TARGET,
    provisionalSubcategoryTarget: PROVISIONAL_SUBCATEGORY_TARGET,
    meetsProvisionalTargets:
      scored > 0 &&
      categoryRate >= PROVISIONAL_CATEGORY_TARGET &&
      subcategoryRate >= PROVISIONAL_SUBCATEGORY_TARGET,
  };
}

export type EvalParseResult =
  | { ok: true; samples: EvalSample[] }
  | { ok: false; message: string };

export function parseEvalSamples(value: unknown): EvalParseResult {
  if (!isRecord(value) || !Array.isArray(value.samples)) {
    return { ok: false, message: "samples 配列がありません" };
  }
  const samples: EvalSample[] = [];
  for (const item of value.samples) {
    const parsed = parseSample(item);
    if (parsed === null) {
      return { ok: false, message: "サンプルの形が不正です" };
    }
    samples.push(parsed);
  }
  return { ok: true, samples };
}

export function formatEvalReport(score: ClassificationScore): string {
  return [
    "分類の正答率（仮）",
    `採点 ${score.scored} 件、未採点 ${score.unscored} 件`,
    `大分類 ${percent(score.categoryRate)}（仮の目安 ${percent(score.provisionalCategoryTarget)}）`,
    `小分類 ${percent(score.subcategoryRate)}（仮の目安 ${percent(score.provisionalSubcategoryTarget)}）`,
    "仮の目安に届かなくても、次の段階は止めません。",
  ].join("\n");
}

function parseSample(value: unknown): EvalSample | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.name !== "string" || typeof value.context !== "string") {
    return null;
  }
  if (!isRecord(value.expected) || typeof value.expected.categoryId !== "string") {
    return null;
  }
  if (!isNullableString(value.expected.subcategoryId)) {
    return null;
  }
  const sample: EvalSample = {
    name: value.name,
    context: value.context,
    expected: {
      categoryId: value.expected.categoryId,
      subcategoryId: value.expected.subcategoryId,
    },
  };
  if (value.predicted === undefined) {
    return sample;
  }
  if (!isRecord(value.predicted)) {
    return null;
  }
  if (
    !isNullableString(value.predicted.categoryId) ||
    !isNullableString(value.predicted.subcategoryId)
  ) {
    return null;
  }
  sample.predicted = {
    categoryId: value.predicted.categoryId,
    subcategoryId: value.predicted.subcategoryId,
  };
  return sample;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
