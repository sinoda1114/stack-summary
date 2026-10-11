import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { ChatFab } from "../../src/client/components/ChatFab";
import { MemoPage } from "../../src/client/pages/MemoPage";
import { OverviewPage } from "../../src/client/pages/OverviewPage";
import { cssVariablesResolver, theme } from "../../src/client/theme";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("iOS Safari のタップ", () => {
  it("状態・キーワード・メモ検索・質問を出せる", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: { memos: [], nextCursor: null },
          error: null,
        }),
      ),
    );

    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(screen.getByRole("combobox", { name: "状態" })).toBeTruthy();
    expect(screen.getByLabelText("キーワード")).toBeTruthy();

    cleanup();
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <MemoryRouter initialEntries={["/memos"]}>
          <Routes>
            <Route path="/memos" element={<MemoPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByLabelText("検索")).toBeTruthy();
    expect(screen.getByLabelText("検索")).toBeTruthy();

    cleanup();
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ChatFab />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "AIチャット" }));
    expect(screen.getByLabelText("質問")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AIチャット" })).toBeNull();
    expect(document.querySelector(".chat-dock-open")).toBeNull();
    expect(screen.getByRole("dialog", { name: "AIチャット" }).getAttribute("aria-modal")).toBeNull();
  });

  it("狭い幅では全幅のシートにして背面を止める", async () => {
    stubBrowser({ narrow: true, coarse: true });
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <>
          <div className="app-shell" />
          <ChatFab />
        </>
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "AIチャット" }));
    expect(document.querySelector(".chat-dock-open")).toBeTruthy();
    expect(document.querySelector(".chat-backdrop")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.querySelector(".app-shell")?.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "AIチャット" }));
    expect(screen.getByRole("dialog", { name: "AIチャット" }).getAttribute("aria-modal")).toBe("true");
  });

  it("狭い幅でも精密ポインタなら質問欄にフォーカスする", async () => {
    stubBrowser({ narrow: true, coarse: false });
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ChatFab />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "AIチャット" }));
    expect(document.activeElement).toBe(screen.getByLabelText("質問"));
  });

  it("タッチ端末では質問欄に自動フォーカスしない", async () => {
    stubBrowser({ narrow: false, coarse: true });
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ChatFab />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "AIチャット" }));
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "AIチャット" }));
    expect(document.activeElement).not.toBe(screen.getByLabelText("質問"));
  });

  it("広い画面の精密ポインタでは質問欄にフォーカスする", async () => {
    stubBrowser({ narrow: false, coarse: false });
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ChatFab />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "AIチャット" }));
    expect(document.activeElement).toBe(screen.getByLabelText("質問"));
  });

  it("キーボードが出ている間は見える高さに収める", async () => {
    stubBrowser({ narrow: true, coarse: true });
    const previousHeight = window.innerHeight;
    const previousViewport = window.visualViewport;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: 320,
        offsetTop: 0,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    try {
      render(
        <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
          <>
            <div className="app-shell" />
            <ChatFab />
          </>
        </MantineProvider>,
      );
      await userEvent.click(screen.getByRole("button", { name: "AIチャット" }));
      const dock = document.querySelector(".chat-dock");
      if (!(dock instanceof HTMLElement)) {
        throw new Error("チャットのドックが無い");
      }
      expect(dock.style.bottom).toBe("480px");
      expect(dock.style.getPropertyValue("--chat-visible-height")).toBe("320px");
      expect(screen.getByRole("button", { name: "閉じる" })).toBeTruthy();
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: previousHeight });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: previousViewport });
    }
  });

  it("閉じるボタンの一辺は 44px 以上", async () => {
    stubBrowser();
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ChatFab />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "AIチャット" }));
    const close = screen.getByRole("button", { name: "閉じる" });
    expect(close.style.getPropertyValue("--cb-size")).toBe(
      "calc(2.75rem * var(--mantine-scale))",
    );
  });

  it("メモ一覧は行全体がリンクになる", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: {
            memos: [{ id: "memo-1", title: "題名", memoDate: "2026-01-01" }],
            nextCursor: null,
          },
          error: null,
        }),
      ),
    );
    render(
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <MemoryRouter initialEntries={["/memos"]}>
          <Routes>
            <Route path="/memos" element={<MemoPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    const link = await screen.findByRole("link", { name: "2026-01-01 題名" });
    expect(link.parentElement?.classList.contains("record-row")).toBe(true);
    expect(link.parentElement?.parentElement?.classList.contains("record-list")).toBe(true);
  });

});

function stubBrowser(options: { narrow?: boolean; coarse?: boolean } = {}): void {
  const narrow = options.narrow ?? false;
  const coarse = options.coarse ?? false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width") ? narrow : query.includes("pointer: coarse") ? coarse : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}
