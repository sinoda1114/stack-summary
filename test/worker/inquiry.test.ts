import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_INQUIRY_ANSWER, inquireStack } from "../../src/worker/ai/inquire";
import { inquireSystemPrompt } from "../../src/worker/ai/prompts/inquire.v1";
import {
  type StructuredGenerateRequest,
  type StructuredGenerator,
} from "../../src/worker/ai/model-output";
import { loadInquiryContext } from "../../src/worker/db/inquiry-context";

describe("メモと技術への問い合わせ", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM memo_techs"),
      env.DB.prepare("DELETE FROM memo_mentions"),
      env.DB.prepare("DELETE FROM memo_tags"),
      env.DB.prepare("DELETE FROM memo_urls"),
      env.DB.prepare("DELETE FROM memo_similars"),
      env.DB.prepare("DELETE FROM tech_tags"),
      env.DB.prepare("DELETE FROM tech_aliases"),
      env.DB.prepare("DELETE FROM memos"),
      env.DB.prepare("DELETE FROM techs"),
      env.DB.prepare("DELETE FROM tags"),
      env.DB.prepare("DELETE FROM imports"),
    ]);
  });

  it("一覧が空ならモデルを呼ばず、まだ無いと答える", async () => {
    const generator = scripted([]);
    const context = await loadInquiryContext(env.DB);
    await expect(
      inquireStack(generator.generator, {
        model: "test-model-light",
        question: "何を採用している？",
        context,
      }),
    ).resolves.toEqual({ answer: EMPTY_INQUIRY_ANSWER });
    expect(generator.requests).toEqual([]);
  });

  it("軽いモデルへ質問とメモと技術を渡し、長い本文は切る", async () => {
    await insertMemo({
      title: "Hono のメモ",
      body: `${"あ".repeat(450)}末尾`,
      memoDate: "2026-10-01",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    await insertTech({
      name: "Hono",
      status: "watching",
      reason: "試している",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    const context = await loadInquiryContext(env.DB);
    expect(context.detailTruncated).toBe(true);
    expect(context.memos[0]?.body.endsWith("…")).toBe(true);
    expect(context.memos[0]?.body).not.toContain("末尾");
    expect(context.techs).toEqual([
      { name: "Hono", status: "様子見", reason: "試している" },
    ]);

    const generator = scripted([JSON.stringify({ answer: "様子見です" })]);
    const answer = await inquireStack(generator.generator, {
      model: "test-model-light",
      question: "Hono はどうしている？",
      context,
    });
    expect(answer).toEqual({ answer: "様子見です" });
    expect(generator.requests[0]?.model).toBe("test-model-light");
    expect(generator.requests[0]?.system).toBe(inquireSystemPrompt);
    expect(generator.requests[0]?.contents).toContain("Hono のメモ");
    expect(generator.requests[0]?.contents).toContain("Hono はどうしている？");
    expect(generator.requests[0]?.contents).toContain("様子見");
    expect(generator.requests[0]?.contents).toContain('"detailTruncated":true');
  });

  it("メモが上限を超えたら新しい方だけ渡し、切れたことを伝える", async () => {
    for (let index = 0; index < 41; index += 1) {
      await insertMemo({
        title: `題${index}`,
        body: "本文",
        memoDate: null,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      });
    }
    const context = await loadInquiryContext(env.DB);
    expect(context.memoTruncated).toBe(true);
    expect(context.memos).toHaveLength(40);
    expect(context.memos[0]?.title).toBe("題40");
    expect(context.memos.some((memo) => memo.title === "題0")).toBe(false);
    expect(context.detailTruncated).toBe(false);
  });

  it("同じ日時のメモは id の昇順で 40 件に切る", async () => {
    const createdAt = "2026-10-01T00:00:00.000Z";
    for (let index = 0; index < 41; index += 1) {
      await insertMemo({
        id: `memo-${String(index).padStart(2, "0")}`,
        title: `題${String(index).padStart(2, "0")}`,
        body: "本文",
        memoDate: null,
        createdAt,
      });
    }
    const context = await loadInquiryContext(env.DB);
    expect(context.memoTruncated).toBe(true);
    expect(context.memos[0]?.title).toBe("題00");
    expect(context.memos[39]?.title).toBe("題39");
    expect(context.memos.some((memo) => memo.title === "題40")).toBe(false);
  });
});

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

async function insertMemo(input: {
  id?: string;
  title: string;
  body: string;
  memoDate: string | null;
  createdAt: string;
}): Promise<void> {
  const importId = crypto.randomUUID();
  const memoId = input.id ?? crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO imports (id, raw_text, raw_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, 'done', ?, ?)`,
    ).bind(importId, input.body, crypto.randomUUID(), input.createdAt, input.createdAt),
    env.DB.prepare(
      `INSERT INTO memos (id, import_id, title, body, memo_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(memoId, importId, input.title, input.body, input.memoDate, input.createdAt),
  ]);
}

async function insertTech(input: {
  name: string;
  status: string;
  reason: string;
  updatedAt: string;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO techs (
       id, name, name_key, status, status_by, reason, reason_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'user', ?, 'user', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.name,
      input.name.toLowerCase(),
      input.status,
      input.reason,
      input.updatedAt,
      input.updatedAt,
    )
    .run();
}
