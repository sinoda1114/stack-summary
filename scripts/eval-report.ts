import {
  PROVISIONAL_CATEGORY_TARGET,
  PROVISIONAL_SUBCATEGORY_TARGET,
  type ClassificationScore,
} from "../src/worker/ai/score-classification.ts";

export function formatEvalReport(score: ClassificationScore): string {
  const verdict = score.meetsProvisionalTargets
    ? "仮の目安に届いています。"
    : "仮の目安に届かなくても、次の段階は止めません。";
  return [
    "分類の正答率（仮）",
    `採点 ${score.scored} 件、未採点 ${score.unscored} 件`,
    `大分類 ${percent(score.categoryRate)}（仮の目安 ${percent(score.provisionalCategoryTarget)}）`,
    `小分類 ${percent(score.subcategoryRate)}（仮の目安 ${percent(score.provisionalSubcategoryTarget)}）`,
    verdict,
  ].join("\n");
}

export function missingGoldenMessage(): string {
  return [
    "正解サンプルは未確定です。eval/golden.local.json はコミットしません。",
    `仮の目安は大分類 ${percent(PROVISIONAL_CATEGORY_TARGET)}、小分類 ${percent(PROVISIONAL_SUBCATEGORY_TARGET)} です。`,
    "仮の目安に届かなくても、次の段階は止めません。",
  ].join("\n");
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
