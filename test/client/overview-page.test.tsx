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
});
