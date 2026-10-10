import type { Hono } from "hono";
import { CHAT_CONTENT_LIMIT, CHAT_MESSAGE_LIMIT, type ChatTurn } from "../../shared/chat";
import { answerChat } from "../ai/answer-chat";
import { chatRouter } from "../ai/chat-router";
import { geminiGeneratorFromApiKey } from "../ai/gemini";
import { readChatRuntime } from "../env";
import { fail, isRecord, ok } from "../http";

export function registerChatRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/chat", async (c) => {
    const parsed = await readChatBody(c.req.raw);
    if (!parsed.ok) {
      return c.json(fail("invalid", parsed.message), 400);
    }
    const runtime = readChatRuntime(c.env);
    if (runtime === null) {
      return c.json(fail("config", "Gemini の設定がありません"), 500);
    }
    try {
      const reply = await answerChat({
        db: c.env.DB,
        generator: geminiGeneratorFromApiKey(runtime.apiKey),
        model: runtime.model,
        messages: parsed.messages,
        router: chatRouter,
      });
      return c.json(ok({ reply }));
    } catch (error) {
      console.error("chat failed", error instanceof Error ? error.name : "unknown");
      return c.json(fail("failed", "回答を作れませんでした"), 500);
    }
  });
}

async function readChatBody(
  request: Request,
): Promise<{ ok: true; messages: ChatTurn[] } | { ok: false; message: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, message: "JSON ではありません" };
  }
  if (!isRecord(body) || !("messages" in body) || !Array.isArray(body.messages)) {
    return { ok: false, message: "質問がありません" };
  }
  if (body.messages.length === 0) {
    return { ok: false, message: "質問がありません" };
  }
  if (body.messages.length > CHAT_MESSAGE_LIMIT) {
    return { ok: false, message: "質問が長すぎます" };
  }
  const messages: ChatTurn[] = [];
  for (const item of body.messages) {
    const turn = readTurn(item);
    if (!turn.ok) {
      return turn;
    }
    messages.push(turn.turn);
  }
  const last = messages.at(-1);
  if (last === undefined || last.role !== "user") {
    return { ok: false, message: "質問がありません" };
  }
  return { ok: true, messages };
}

function readTurn(
  item: unknown,
): { ok: true; turn: ChatTurn } | { ok: false; message: string } {
  if (
    !isRecord(item) ||
    (item.role !== "user" && item.role !== "assistant") ||
    typeof item.content !== "string"
  ) {
    return { ok: false, message: "メッセージの形が不正です" };
  }
  const content = item.content.trim();
  if (content.length === 0) {
    return { ok: false, message: "質問がありません" };
  }
  if (content.length > CHAT_CONTENT_LIMIT) {
    return { ok: false, message: "質問が長すぎます" };
  }
  return { ok: true, turn: { role: item.role, content } };
}
