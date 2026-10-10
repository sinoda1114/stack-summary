import { describe, expect, it } from "vitest";
import {
  formatEvalReport,
  parseEvalSamples,
  scoreClassification,
  type EvalSample,
} from "../../src/worker/ai/score-classification";

describe("分類の正答率", () => {
  it("仮の目安ちょうどは達成になり、下回っても例外にしない", () => {
    const met = scoreClassification(fixture(10, 9, 8));
    expect(met.categoryRate).toBe(0.9);
    expect(met.subcategoryRate).toBe(0.8);
    expect(met.meetsProvisionalTargets).toBe(true);

    const missed = scoreClassification(fixture(10, 9, 7));
    expect(missed.meetsProvisionalTargets).toBe(false);
    expect(missed.categoryHits).toBe(9);
    expect(missed.subcategoryHits).toBe(7);
    expect(formatEvalReport(missed)).toContain("次の段階は止めません");
  });

  it("予測が無い行は分母に入れず、未分類同士は当たる", () => {
    const samples: EvalSample[] = [
      {
        name: "Hono",
        context: "ルータ",
        expected: { categoryId: "backend", subcategoryId: null },
        predicted: { categoryId: "backend", subcategoryId: null },
      },
      {
        name: "未採点",
        context: "まだ予測が無い",
        expected: { categoryId: "frontend", subcategoryId: "react" },
      },
    ];
    const score = scoreClassification(samples);
    expect(score.scored).toBe(1);
    expect(score.unscored).toBe(1);
    expect(score.categoryHits).toBe(1);
    expect(score.subcategoryHits).toBe(1);
    expect(score.meetsProvisionalTargets).toBe(true);
  });

  it("サンプルの形が違うと採点しない", () => {
    expect(parseEvalSamples({ samples: [] })).toEqual({
      ok: true,
      samples: [],
    });
    expect(parseEvalSamples({}).ok).toBe(false);
    expect(
      parseEvalSamples({
        samples: [{ name: "Hono", context: "ルータ", expected: { categoryId: 1 } }],
      }).ok,
    ).toBe(false);
  });
});

function fixture(
  total: number,
  categoryHits: number,
  subcategoryHits: number,
): EvalSample[] {
  return Array.from({ length: total }, (_, index) => ({
    name: `tech-${index}`,
    context: "仮の採点用",
    expected: { categoryId: "backend", subcategoryId: "sub" },
    predicted: {
      categoryId: index < categoryHits ? "backend" : "frontend",
      subcategoryId: index < subcategoryHits ? "sub" : "other",
    },
  }));
}
