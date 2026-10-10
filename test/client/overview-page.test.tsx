import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { OverviewPage } from "../../src/client/pages/OverviewPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("全体図", () => {
  it("小分類が1つの大分類は小分類名を出さない", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: [
            {
              id: "backend",
              name: "バックエンド",
              subcategories: [
                {
                  id: "sub",
                  name: "フレームワーク",
                  techs: [
                    { id: "tech-1", name: "Hono", status: "unrated", memoCount: 1 },
                  ],
                },
              ],
            },
          ],
          error: null,
        }),
      ),
    );

    render(
      <MantineProvider>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    expect(await screen.findByText("Hono 未評価")).toBeTruthy();
    expect(screen.queryByText("フレームワーク")).toBeNull();
    expect(screen.getByText("バックエンド")).toBeTruthy();
  });

  it("小分類名は比較画面へリンクする", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: [
            {
              id: "backend",
              name: "バックエンド",
              subcategories: [
                {
                  id: "frameworks",
                  name: "フレームワーク",
                  techs: [{ id: "tech-1", name: "Hono", status: "unrated", memoCount: 1 }],
                },
                {
                  id: "runtimes",
                  name: "ランタイム",
                  techs: [{ id: "tech-2", name: "Workers", status: "adopted", memoCount: 1 }],
                },
              ],
            },
          ],
          error: null,
        }),
      ),
    );

    render(
      <MantineProvider>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    const framework = await screen.findByRole("link", { name: "フレームワーク" });
    const runtime = screen.getByRole("link", { name: "ランタイム" });
    expect(framework.getAttribute("href")).toBe("/subcategories/frameworks");
    expect(runtime.getAttribute("href")).toBe("/subcategories/runtimes");
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
