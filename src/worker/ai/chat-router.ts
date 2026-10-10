import type { ChatTurn } from "../../shared/chat";

export type ChatIntent = "stack" | "usage" | "out_of_scope";

export type ChatRouter = {
  route(messages: readonly ChatTurn[]): Promise<ChatIntent>;
};

export const OUT_OF_SCOPE_REPLY =
  "対象外です。取り込んだメモと技術、またはこのアプリの使い方について聞いてください。";

// 振り分けは後からこの定数へ渡す。Clef の実装は置かない。
export const chatRouter: ChatRouter | null = null;
