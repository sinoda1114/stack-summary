import { describe, expect, it, vi } from "vitest";
import { provisionalCategoryGuidance } from "../../src/worker/ai/category-guidance";
import {
  acceptClassification,
  type ClassifierInput,
} from "../../src/worker/ai/classifier";
import { extractTechs } from "../../src/worker/ai/extract-techs";
import { classifyTech, geminiClassifier } from "../../src/worker/ai/gemini-classifier";
import {
  InvalidModelOutput,
  geminiResponseSchema,
  generateValidated,
  type StructuredGenerateRequest,
  type StructuredGenerator,
} from "../../src/worker/ai/model-output";
import {
  classifySchema,
  classifySystemPrompt,
} from "../../src/worker/ai/prompts/classify.v1";
import { extractSystemPrompt, extractTechSchema } from "../../src/worker/ai/prompts/extract.v1";
import { splitMemoSchema, splitSystemPrompt } from "../../src/worker/ai/prompts/split.v1";
import { splitMemos } from "../../src/worker/ai/split-memos";
import { importTextProblem, readGeminiRuntime } from "../../src/worker/env";
import { z } from "zod";

const catalog: Pick<ClassifierInput, "categories" | "subcategories"> = {
  categories: [{ id: "backend", name: "バックエンド" }],
  subcategories: [
    {
      id: "sub-hono",
      categoryId: "backend",
      name: "Web フレームワーク",
      examples: ["Hono"],
    },
  ],
};

describe("Gemini の指示とモック", () => {
  it("分割は全文を渡し、技術メモ以外は件数だけ返す", async () => {
    const text = "自分: Hono がよい\n他人: お知らせです\n他人: Cloudflare Workers を見た";
    const generator = scripted([
      JSON.stringify({
        memos: [
          {
            title: "Hono",
            body: "Hono がよい https://hono.dev",
            memoDate: "2026-10-10",
            urls: ["https://hono.dev"],
          },
        ],
        skippedCount: 1,
      }),
    ]);
    const split = await splitMemos(generator.generator, {
      model: "test-model",
      text,
    });
    expect(split.skippedCount).toBe(1);
    expect(split.memos[0]?.body).toContain("https://hono.dev");
    expect(generator.requests[0]?.contents).toBe(text);
    expect(generator.requests[0]?.system).toContain("発言者が本人以外でも除きません");
    expect(splitSystemPrompt).toContain("リンク表記は除かない");
  });

  it("抽出は名前と関係と別名とタグまでで、既存 ID も技術一覧も渡さない", async () => {
    const generator = scripted([
      JSON.stringify({
        techs: [
          {
            name: "Cloudflare Workers",
            relation: "subject",
            aliases: ["Workers"],
            tags: [{ name: "Cloudflare", kind: "vendor" }],
          },
        ],
      }),
    ]);
    const extracted = await extractTechs(generator.generator, {
      model: "test-model",
      title: "Worker Previews",
      body: "Worker Previews を試した",
    });
    expect(extracted.techs).toEqual([
      {
        name: "Cloudflare Workers",
        relation: "subject",
        aliases: ["Workers"],
        tags: [{ name: "Cloudflare", kind: "vendor" }],
      },
    ]);
    const request = generator.requests[0];
    expect(request?.system).toContain("既存技術の ID は返さない");
    expect(request?.system).toContain("親の製品名を name に入れる");
    expect(request?.system).toContain("vendor のタグ");
    expect(request?.system).toContain("短い呼び方と製品の正式名");
    expect(request?.contents).toBe(
      JSON.stringify({
        title: "Worker Previews",
        body: "Worker Previews を試した",
      }),
    );
    expect(JSON.stringify(extractTechSchema.toJSONSchema())).not.toContain(
      '"id"',
    );
    expect(extractSystemPrompt).not.toContain("技術一覧");
  });

  it("余計な項目と実在しない日付は 1 回だけ再試行する", async () => {
    const extra = JSON.stringify({
      memos: [
        {
          title: "Hono",
          body: "本文",
          memoDate: "2026-10-10",
          urls: [],
          extra: true,
        },
      ],
      skippedCount: 0,
    });
    const badDate = JSON.stringify({
      memos: [
        {
          title: "Hono",
          body: "本文",
          memoDate: "2026-02-30",
          urls: [],
        },
      ],
      skippedCount: 0,
    });
    const nested = JSON.stringify({
      techs: [
        {
          name: "Hono",
          relation: "subject",
          aliases: [],
          tags: [{ name: "Web", kind: "topic", extra: true }],
        },
      ],
    });
    const goodSplit = JSON.stringify({
      memos: [
        {
          title: "Hono",
          body: "本文",
          memoDate: "2026-10-10",
          urls: [],
        },
      ],
      skippedCount: 0,
    });
    const goodExtract = JSON.stringify({
      techs: [
        {
          name: "Hono",
          relation: "subject",
          aliases: [],
          tags: [{ name: "Web", kind: "topic" }],
        },
      ],
    });
    expect(splitMemoSchema.safeParse(JSON.parse(badDate)).success).toBe(false);
    expect(splitMemoSchema.safeParse(JSON.parse(goodSplit)).success).toBe(true);
    expect(extractTechSchema.safeParse(JSON.parse(nested)).success).toBe(false);
    expect(
      classifySchema.safeParse({
        kind: "unclassified",
        confidence: 0.2,
        extra: true,
      }).success,
    ).toBe(false);

    const retriedSplit = scripted([extra, goodSplit]);
    await expect(
      generateValidated(retriedSplit.generator, request(), splitMemoSchema),
    ).resolves.toMatchObject({ skippedCount: 0 });
    expect(retriedSplit.requests).toHaveLength(2);

    const retriedDate = scripted([badDate, goodSplit]);
    await expect(
      generateValidated(retriedDate.generator, request(), splitMemoSchema),
    ).resolves.toMatchObject({
      memos: [expect.objectContaining({ memoDate: "2026-10-10" })],
    });
    expect(retriedDate.requests).toHaveLength(2);

    const retriedExtract = scripted([nested, goodExtract]);
    await expect(
      generateValidated(retriedExtract.generator, request(), extractTechSchema),
    ).resolves.toMatchObject({ techs: [{ name: "Hono" }] });
    expect(retriedExtract.requests).toHaveLength(2);
  });

  it("不正な JSON は 1 回だけ再試行し、それでも不正なら失敗する", async () => {
    const generator = scripted(["{", "{"]);
    await expect(
      generateValidated(generator.generator, request(), z.object({ ok: z.boolean() })),
    ).rejects.toBeInstanceOf(InvalidModelOutput);
    expect(generator.requests).toHaveLength(2);
  });

  it("通信の失敗は JSON の再試行にしない", async () => {
    const generate = vi.fn(async () => {
      throw new Error("network");
    });
    await expect(
      generateValidated(
        { generate },
        request(),
        z.object({ ok: z.boolean() }),
      ),
    ).rejects.toThrow("network");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("分類の提案は、実在しない ID とその他相当を未分類にする", async () => {
    const input: ClassifierInput = {
      tech: { name: "Hono", context: "ルータ" },
      ...catalog,
    };
    expect(
      acceptClassification(
        {
          categoryId: "backend",
          subcategories: [{ kind: "existing", subcategoryId: "sub-hono" }],
          confidence: 0.1,
        },
        input,
      ),
    ).toEqual({
      kind: "classified",
      categoryId: "backend",
      subcategories: [{ kind: "existing", subcategoryId: "sub-hono" }],
    });
    expect(
      acceptClassification(
        {
          categoryId: "backend",
          subcategories: [
            { kind: "existing", subcategoryId: "sub-hono" },
            { kind: "new", name: "エッジ" },
          ],
          confidence: 0.4,
        },
        input,
      ),
    ).toEqual({
      kind: "classified",
      categoryId: "backend",
      subcategories: [
        { kind: "existing", subcategoryId: "sub-hono" },
        { kind: "new", name: "エッジ" },
      ],
    });
    expect(
      acceptClassification(
        {
          categoryId: "backend",
          subcategories: [{ kind: "existing", subcategoryId: "missing" }],
          confidence: 0.9,
        },
        input,
      ),
    ).toEqual({ kind: "unclassified" });
    expect(
      acceptClassification(
        {
          categoryId: "missing",
          subcategories: [{ kind: "new", name: "エッジ" }],
          confidence: 0.9,
        },
        input,
      ),
    ).toEqual({ kind: "unclassified" });
    expect(
      acceptClassification(
        {
          categoryId: "backend",
          subcategories: [{ kind: "new", name: " その他 " }],
          confidence: 0.9,
        },
        input,
      ),
    ).toEqual({ kind: "unclassified" });
    expect(
      acceptClassification(
        {
          categoryId: "backend",
          subcategories: [{ kind: "new", name: "エッジ" }],
          confidence: 0.4,
        },
        input,
      ),
    ).toEqual({
      kind: "classified",
      categoryId: "backend",
      subcategories: [{ kind: "new", name: "エッジ" }],
    });
    expect(
      acceptClassification(
        {
          categoryId: "backend",
          subcategories: [{ kind: "new", name: "  " }],
          confidence: 0.4,
        },
        input,
      ),
    ).toEqual({ kind: "unclassified" });
    expect(
      acceptClassification(
        {
          categoryId: "backend",
          subcategories: [{ kind: "new", name: "\u0085" }],
          confidence: 0.4,
        },
        input,
      ),
    ).toEqual({ kind: "unclassified" });
    expect(
      acceptClassification(
        {
          categoryId: "frontend",
          subcategories: [{ kind: "existing", subcategoryId: "sub-hono" }],
          confidence: 0.4,
        },
        {
          categories: [
            ...input.categories,
            { id: "frontend", name: "フロントエンド" },
          ],
          subcategories: input.subcategories,
        },
      ),
    ).toEqual({ kind: "unclassified" });

    const generator = scripted([
      JSON.stringify({
        categoryId: null,
        subcategories: [],
        confidence: 0.2,
      }),
    ]);
    const classifier = geminiClassifier(generator.generator, "test-model");
    await expect(classifyTech(classifier, input)).resolves.toEqual({
      kind: "unclassified",
    });
    expect(generator.requests[0]?.system).toContain("existing");
    expect(generator.requests[0]?.system).toBe(classifySystemPrompt);
    const classifyJson = JSON.stringify(geminiResponseSchema(classifySchema));
    expect(classifyJson).toContain('"existing"');
    expect(classifyJson).toContain('"new"');
    expect(classifyJson).not.toContain('"const"');
    const splitJson = JSON.stringify(geminiResponseSchema(splitMemoSchema));
    expect(splitJson).toContain('"format":"date"');
    expect(splitJson).not.toContain("pattern");
    expect(generator.requests[0]?.contents).toContain("provisionalGuidance");
    expect(provisionalCategoryGuidance).toHaveLength(9);
  });
});

describe("仮の取り込み上限", () => {
  it("空と 50000 超を拒み、軽いモデルか重いモデルが空なら設定を読まない", () => {
    expect(importTextProblem("   ", 50000)).toBe("empty");
    expect(importTextProblem("a".repeat(50000), 50000)).toBeNull();
    expect(importTextProblem("a".repeat(50001), 50000)).toBe("too_long");
    expect(
      readGeminiRuntime({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL_LIGHT: " ",
        GEMINI_MODEL_HEAVY: "heavy-model",
        IMPORT_MAX_CHARS: "50000",
      }),
    ).toBeNull();
    expect(
      readGeminiRuntime({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL_LIGHT: "light-model",
        GEMINI_MODEL_HEAVY: " ",
        IMPORT_MAX_CHARS: "50000",
      }),
    ).toBeNull();
    expect(
      readGeminiRuntime({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL_LIGHT: "light-model",
        GEMINI_MODEL_HEAVY: "heavy-model",
        IMPORT_MAX_CHARS: "50000",
      }),
    ).toEqual({
      apiKey: "key",
      modelLight: "light-model",
      modelHeavy: "heavy-model",
      importMaxChars: 50000,
    });
  });
});

function request(): StructuredGenerateRequest {
  return {
    model: "test-model",
    system: "system",
    contents: "contents",
    responseJsonSchema: {},
  };
}

function scripted(responses: readonly string[]): {
  generator: StructuredGenerator;
  requests: StructuredGenerateRequest[];
} {
  const requests: StructuredGenerateRequest[] = [];
  return {
    requests,
    generator: {
      async generate(next: StructuredGenerateRequest): Promise<string> {
        requests.push(next);
        const response = responses[requests.length - 1];
        if (response === undefined) {
          throw new Error("モックの応答が足りません");
        }
        return response;
      },
    },
  };
}
