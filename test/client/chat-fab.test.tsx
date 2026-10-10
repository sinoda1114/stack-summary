import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatFab } from "../../src/client/components/ChatFab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("問い合わせ", () => {
  it("閉じたボタンからパネルを開き、根拠のある返事を出す", async () => {
    stubBrowser();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
      expect(init?.method).toBe("POST");
      expect(body.messages).toEqual([{ role: "user", content: "Hono は？" }]);
      return Response.json({
        success: true,
        data: { reply: "根拠には Hono があります。" },
        error: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MantineProvider>
        <ChatFab />
      </MantineProvider>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "問い合わせ" }));
    expect(screen.getByRole("dialog", { name: "問い合わせ" })).toBeTruthy();
    expect(screen.getByText("取り込んだメモと技術について聞けます。使い方も短く案内します。")).toBeTruthy();

    await userEvent.type(screen.getByLabelText("質問"), "Hono は？");
    await userEvent.click(screen.getByRole("button", { name: "送る" }));

    expect(await screen.findByText("根拠には Hono があります。")).toBeTruthy();
    expect(screen.getByText("Hono は？")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("失敗したときは理由を出し、パネルを閉じられる", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: false,
          data: null,
          error: { code: "failed", message: "回答を作れませんでした" },
        }),
      ),
    );

    render(
      <MantineProvider>
        <ChatFab />
      </MantineProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "問い合わせ" }));
    await userEvent.type(screen.getByLabelText("質問"), "分からないこと");
    await userEvent.click(screen.getByRole("button", { name: "送る" }));
    expect(await screen.findByText("回答を作れませんでした")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

function stubBrowser(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}
