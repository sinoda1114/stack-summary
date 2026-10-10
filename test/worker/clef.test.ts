import { describe, expect, it } from "vitest";
import {
  chatRouteAnswer,
  chatRouteFromChoice,
  routeChatQuestion,
} from "../../src/worker/ai/chat-route";
import {
  CLEF_MODEL,
  clefDecider,
  parseClefChoices,
  type ClefDecider,
} from "../../src/worker/ai/clef";
import {
  classificationRequest,
  clefClassifier,
  proposalFromChoices,
  UNCLASSIFIED_CHOICE,
} from "../../src/worker/ai/clef-classifier";
import { decideNearTech } from "../../src/worker/ai/clef-name-match";
import type { ClassifierInput } from "../../src/worker/ai/classifier";
import { classifyTech } from "../../src/worker/ai/gemini-classifier";
import { InvalidModelOutput } from "../../src/worker/ai/model-output";
import {
  isNearAliasKey,
  rankNameCandidates,
} from "../../src/worker/ingest/name-candidates";

const input: ClassifierInput = {
  tech: { name: "Hono", context: "ルータ" },
  categories: [
    { id: "backend", name: "バックエンド" },
    { id: "frontend", name: "フロントエンド" },
  ],
  subcategories: [
    {
      id: "sub-hono",
      categoryId: "backend",
      name: "Web フレームワーク",
      examples: ["Hono"],
    },
    {
      id: "sub-react",
      categoryId: "frontend",
      name: "UI",
      examples: [],
    },
  ],
};

describe("Clef の分類", () => {
  it("選択肢は既存の分類と未分類だけで、新しい分類名は無い", () => {
    const request = classificationRequest(input);
    if (request === null) {
      throw new Error("分類の質問がありません");
    }
    expect(request.questions.category).toBeUndefined();
    expect(Object.keys(request.questions.subcategory?.criteria ?? {}).sort()).toEqual([
      "sub-hono",
      "sub-react",
      UNCLASSIFIED_CHOICE,
    ]);
    expect(request.questions.subcategory?.instructions).toContain("新しい分類名は作らない");
    expect(request.questions.subcategory?.criteria["sub-hono"]).toContain(
      "バックエンド / Web フレームワーク",
    );
  });

  it("選んだ小分類を1つ返し、未分類と候補外は未分類で、確信度では拒まない", () => {
    expect(
      proposalFromChoices(input, {
        subcategory: choice("sub-hono", 0.01),
      }),
    ).toEqual({ kind: "existing", subcategoryId: "sub-hono", confidence: 0.01 });
    expect(
      proposalFromChoices(input, {
        subcategory: choice(UNCLASSIFIED_CHOICE, 0.4),
      }).kind,
    ).toBe("unclassified");
    expect(
      proposalFromChoices(input, {
        subcategory: choice("missing", 0.9),
      }).kind,
    ).toBe("unclassified");
  });

  it("小分類が無いときは Clef を呼ばず未分類にする", async () => {
    let calls = 0;
    const classifier = clefClassifier({
      async decide() {
        calls += 1;
        throw new Error("呼ばない");
      },
    });
    await expect(
      classifyTech(classifier, { ...input, subcategories: [] }),
    ).resolves.toEqual({ kind: "unclassified" });
    expect(calls).toBe(0);
    expect(classifier.version).toBe("clef-flash.v1");
  });

  it("clef-flash の応答を選択肢の確率として読む", async () => {
    let model = "";
    let body: Record<string, unknown> = {};
    const decider = clefDecider({
      async run(next, payload) {
        model = next;
        body = payload;
        return {
          model: "clef-flash",
          answers: {
            subcategory: {
              type: "choice",
              choice: "sub-hono",
              probabilities: { "sub-hono": 0.8, unclassified: 0.2 },
              confidence: 0.8,
            },
          },
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    });
    await expect(classifyTech(clefClassifier(decider), input)).resolves.toEqual({
      kind: "existing",
      subcategoryId: "sub-hono",
    });
    expect(model).toBe(CLEF_MODEL);
    expect(body.model).toBe("clef-flash");
    expect(parseClefChoices({ answers: {} })).toEqual({});
    expect(() => parseClefChoices({ answers: { category: { choice: "backend" } } })).toThrow(
      InvalidModelOutput,
    );
  });
});

describe("Clef の名寄せと質問の振り分け", () => {
  it("空白を除いただけの別キーは近く、同じキーと短すぎるキーは近くない", () => {
    expect(isNearAliasKey("workers", "cloudflareworkers")).toBe(true);
    expect(isNearAliasKey("node.js", "nodejs")).toBe(true);
    expect(isNearAliasKey("hono", "hono")).toBe(false);
    expect(isNearAliasKey("go", "golang")).toBe(false);
    expect(
      rankNameCandidates(
        ["workers"],
        [
          {
            id: "b",
            name: "Cloudflare Workers",
            alias: "Cloudflare Workers",
            aliasKey: "cloudflareworkers",
          },
          { id: "a", name: "Hono", alias: "Hono", aliasKey: "hono" },
        ],
        12,
      ).map((candidate) => candidate.id),
    ).toEqual(["b"]);
  });

  it("候補が無ければ新しい技術、候補外の選択も新しい技術", async () => {
    const decider = failingDecider();
    await expect(
      decideNearTech(decider, {
        name: "Hono",
        aliases: [],
        context: "",
        candidates: [],
      }),
    ).resolves.toEqual({ kind: "new" });
    await expect(
      decideNearTech(scriptedRoute({ tech: "missing" }), {
        name: "Workers",
        aliases: ["Workers"],
        context: "実行環境",
        candidates: [{ id: "tech-1", name: "Cloudflare Workers", aliases: [] }],
      }),
    ).resolves.toEqual({ kind: "new" });
  });

  it("質問はメモと技術、使い方、対象外に分かれる", async () => {
    await expect(routeChatQuestion(scriptedRoute({ route: "stack" }), "Hono は？")).resolves.toBe(
      "stack",
    );
    await expect(routeChatQuestion(scriptedRoute({ route: "howto" }), "どう使う？")).resolves.toBe(
      "howto",
    );
    expect(chatRouteFromChoice("unknown")).toBe("out_of_scope");
    expect(chatRouteAnswer("howto")).toContain("全体図");
    expect(chatRouteAnswer("out_of_scope")).toContain("使い方");
  });
});

function choice(
  id: string,
  confidence: number,
): {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
} {
  return {
    type: "choice",
    choice: id,
    probabilities: { [id]: confidence },
    confidence,
  };
}

function scriptedRoute(choices: Record<string, string>): ClefDecider {
  return {
    async decide() {
      return {
        answers: Object.fromEntries(
          Object.entries(choices).map(([id, picked]) => [id, choice(picked, 0.8)]),
        ),
      };
    },
  };
}

function failingDecider(): ClefDecider {
  return {
    async decide() {
      throw new Error("呼ばない");
    },
  };
}
