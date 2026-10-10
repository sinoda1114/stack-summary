import { routeChatQuestion } from "./chat-route";
import type { ClefDecider } from "./clef";

export type ChatIntent = "stack" | "usage" | "out_of_scope";

export type ChatRouter = {
  route(question: string): Promise<ChatIntent>;
};

const USAGE_REPLY = [
  "全体図で技術の状態を見る。",
  "取り込みにテキストを貼ると、メモと技術になる。",
  "メモで本文を見る。受け箱で未評価と未分類を確認する。",
  "分類で大分類と小分類を整理する。書き出しは JSON と Markdown。",
  "狭い幅では、全体図・取り込み・メモだけを出す。",
].join("");

const OUT_OF_SCOPE_REPLY =
  "対象外です。取り込んだメモと技術、またはこのアプリの使い方について聞いてください。";

// 定数は束ねを持たない。問い合わせはリクエストの AI で clefChatRouter を渡す。
export const chatRouter: ChatRouter | null = null;

export function clefChatRouter(decider: ClefDecider): ChatRouter {
  return {
    route(question) {
      return routeChatQuestion(decider, question);
    },
  };
}

export async function routedChatAnswer(
  question: string,
  router: ChatRouter | null = chatRouter,
): Promise<string | null> {
  if (router === null) {
    return null;
  }
  return answerForIntent(await router.route(question));
}

function answerForIntent(intent: ChatIntent): string | null {
  switch (intent) {
    case "stack":
      return null;
    case "usage":
      return USAGE_REPLY;
    case "out_of_scope":
      return OUT_OF_SCOPE_REPLY;
    default: {
      const neverIntent: never = intent;
      return neverIntent;
    }
  }
}
