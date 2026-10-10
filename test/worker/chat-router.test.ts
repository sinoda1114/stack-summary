import { describe, expect, it } from "vitest";
import { chatRouter, replyForIntent } from "../../src/worker/ai/chat-router";

describe("質問の振り分け入口", () => {
  it("Clef は未接続で、使い方と対象外だけ定型で返す", () => {
    expect(chatRouter).toBeNull();
    expect(replyForIntent("stack")).toBeNull();
    expect(replyForIntent("usage")).toContain("全体図");
    expect(replyForIntent("out_of_scope")).toContain("対象外");
  });
});
