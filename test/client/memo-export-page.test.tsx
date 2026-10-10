import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { MemoText } from "../../src/client/components/MemoText";
import { ExportPage } from "../../src/client/pages/ExportPage";
import { MemoPage } from "../../src/client/pages/MemoPage";

afterEach(() => {
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
      <MemoText text="見る https://example.com/a. と javascript:alert(1)" />,
    );
    const link = screen.getByRole("link", { name: "https://example.com/a" });
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("link", { name: /javascript/ })).toBeNull();
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
