import type { ChatTurn } from "../../shared/chat";
import { loadChatEvidence } from "../db/chat-evidence";
import { OUT_OF_SCOPE_REPLY, type ChatIntent, type ChatRouter } from "./chat-router";
import { geminiResponseSchema, generateValidated, type StructuredGenerator } from "./model-output";
import { chatContents, chatReplySchema, chatSystemPrompt, chatUsageGuide } from "./prompts/chat.v1";

const QUESTION_LIMIT = 4000;

export async function answerChat(input: {
  db: D1Database;
  generator: StructuredGenerator;
  model: string;
  messages: ChatTurn[];
  router?: ChatRouter | null;
}): Promise<string> {
  const intent = await resolveIntent(input.messages, input.router ?? null);
  if (intent === "out_of_scope") {
    return OUT_OF_SCOPE_REPLY;
  }
  const evidence =
    intent === "usage" ? "" : await loadChatEvidence(input.db, askedText(input.messages));
  const parsed = await generateValidated(
    input.generator,
    {
      model: input.model,
      system: chatSystemPrompt,
      contents: chatContents({
        intent,
        usage: chatUsageGuide,
        evidence,
        messages: input.messages,
      }),
      responseJsonSchema: geminiResponseSchema(chatReplySchema),
    },
    chatReplySchema,
  );
  return parsed.reply;
}

async function resolveIntent(
  messages: readonly ChatTurn[],
  router: ChatRouter | null,
): Promise<ChatIntent | null> {
  if (router === null) {
    return null;
  }
  return router.route(messages);
}

function askedText(messages: readonly ChatTurn[]): string {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n")
    .slice(0, QUESTION_LIMIT);
}
