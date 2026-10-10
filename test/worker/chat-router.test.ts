import { describe, expect, it } from "vitest";
import { chatRouter, routedChatAnswer } from "../../src/worker/ai/chat-router";

describe("質問の振り分け入口", () => {
  it("ルータを渡さないときはメモと技術の答えに進む", async () => {
    expect(chatRouter).toBeNull();
    expect(await routedChatAnswer("使い方は？")).toBeNull();
  });
});
