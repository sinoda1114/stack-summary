export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export const CHAT_MESSAGE_LIMIT = 8;
export const CHAT_CONTENT_LIMIT = 1000;
