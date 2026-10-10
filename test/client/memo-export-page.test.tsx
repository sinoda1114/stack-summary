import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { MemoText } from "../../src/client/components/MemoText";
import { ExportPage } from "../../src/client/pages/ExportPage";
import { MemoPage } from "../../src/client/pages/MemoPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("メモと書き出しの画面", () => {
  it("狭い幅では格上げと書き出しを出さない", async () => {
    stubMatch(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: {
            id: "memo-1",
            title: "題",
            body: "本文",
            memoDate: null,
            techs: [],
            mentions: [{ name: "Laya" }],
            similars: [],
          },
        }),
      ),
    );
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/memos/memo-1"]}>
          <Routes>
            <Route path="/memos/:id" element={<MemoPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByText("言及 Laya")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "格上げ" })).toBeNull();

    render(
      <MantineProvider>
        <ExportPage />
      </MantineProvider>,
    );
    expect(screen.getByText("この幅では書き出しを出しません。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "JSON" })).toBeNull();
  });

  it("広い幅では書き出しを出し、本文の http だけをリンクにする", () => {
    stubMatch(false);
    render(
      <MantineProvider>
        <ExportPage />
      </MantineProvider>,
    );
    expect(screen.getByRole("button", { name: "JSON" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Markdown" })).toBeTruthy();

    render(
      <MemoText text="見る https://example.com/a. と https://example.com/b),; javascript:alert(1)" />,
    );
    const link = screen.getByRole("link", { name: "https://example.com/a" });
    const tail = screen.getByRole("link", { name: "https://example.com/b" });
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(tail.getAttribute("href")).toBe("https://example.com/b");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.parentElement?.textContent).toBe(
      "見る https://example.com/a. と https://example.com/b),; javascript:alert(1)",
    );
    expect(screen.queryByRole("link", { name: /javascript/ })).toBeNull();
  });

  it("取得に失敗したら日本語の理由を出す", async () => {
    stubMatch(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: false,
          data: null,
          error: { code: "forbidden", message: "認証に失敗しました" },
        }),
      ),
    );
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/memos"]}>
          <Routes>
            <Route path="/memos" element={<MemoPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByText("認証に失敗しました")).toBeTruthy();
  });

  it("格上げのあと詳細の取り直しが失敗しても本文を残す", async () => {
    stubMatch(false);
    let detailCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST" && String(input).includes("/api/mentions/promote")) {
          return Response.json({
            success: true,
            data: { techId: "tech-1" },
            error: null,
          });
        }
        detailCalls += 1;
        if (detailCalls === 1) {
          return Response.json({
            success: true,
            data: {
              id: "memo-1",
              title: "題",
              body: "本文",
              memoDate: null,
              techs: [],
              mentions: [{ name: "Laya" }],
              similars: [],
            },
            error: null,
          });
        }
        return Response.json(
          {
            success: false,
            data: null,
            error: { code: "failed", message: "メモを取得できませんでした" },
          },
          { status: 500 },
        );
      }),
    );
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/memos/memo-1"]}>
          <Routes>
            <Route path="/memos/:id" element={<MemoPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByRole("button", { name: "格上げ" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "格上げ" }));
    expect(await screen.findByText("メモを取得できませんでした")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "題" })).toBeTruthy();
    expect(screen.getByText("本文")).toBeTruthy();
    expect(screen.getByText("言及 Laya")).toBeTruthy();
  });
});

function stubMatch(matches: boolean): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches,
    media: "",
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}
