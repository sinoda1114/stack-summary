import type { Hono } from "hono";
import { chatRouteAnswer, routeChatQuestion } from "../ai/chat-route";
import { clefBinding, clefDecider } from "../ai/clef";
import { geminiGeneratorFromApiKey } from "../ai/gemini";
import { inquireStack } from "../ai/inquire";
import { InvalidModelOutput } from "../ai/model-output";
import { loadInquiryContext } from "../db/inquiry-context";
import { readGeminiRuntime } from "../env";
import { fail, ok, readRecord } from "../http";

const QUESTION_MAX = 2000;

export function registerInquiryRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/inquiries", async (c) => {
    const question = await readQuestion(c.req.raw);
    if (!question.ok) {
      return c.json(fail(question.code, question.message), 400);
    }
    try {
      const route = await routeChatQuestion(
        clefDecider(clefBinding(c.env.AI)),
        question.text,
      );
      if (route !== "stack") {
        return c.json(ok({ answer: chatRouteAnswer(route) }));
      }
      const runtime = readGeminiRuntime(c.env);
      if (runtime === null) {
        return c.json(fail("config", "Gemini の設定がありません"), 500);
      }
      const context = await loadInquiryContext(c.env.DB);
      const result = await inquireStack(geminiGeneratorFromApiKey(runtime.apiKey), {
        // 渡した一覧から答えの文を書くので、軽いモデルを使う。
        model: runtime.modelLight,
        question: question.text,
        context,
      });
      return c.json(ok({ answer: result.answer }));
    } catch (error) {
      if (error instanceof InvalidModelOutput) {
        return c.json(fail("model", "問い合わせに答えられませんでした"), 502);
      }
      throw error;
    }
  });
}

async function readQuestion(
  request: Request,
): Promise<
  | { ok: true; text: string }
  | { ok: false; code: "invalid" | "empty" | "too_long"; message: string }
> {
  const body = await readRecord(request);
  if (body === null || typeof body.question !== "string") {
    return { ok: false, code: "invalid", message: "質問がありません" };
  }
  const text = body.question.trim();
  if (text.length === 0) {
    return { ok: false, code: "empty", message: "質問が空です" };
  }
  if (text.length > QUESTION_MAX) {
    return { ok: false, code: "too_long", message: "質問が長すぎます" };
  }
  return { ok: true, text };
}
