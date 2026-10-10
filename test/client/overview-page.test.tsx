import { MantineProvider } from "@mantine/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { OverviewPage } from "../../src/client/pages/OverviewPage";

afterEach(() => {
  cleanup();
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
              subcategoryCount: 1,
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
              subcategoryCount: 2,
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

  it("絞り込みで残った1件でも小分類名を出す", async () => {
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
              subcategoryCount: 2,
              subcategories: [
                {
                  id: "frameworks",
                  name: "フレームワーク",
                  techs: [{ id: "tech-1", name: "Hono", status: "unrated", memoCount: 1 }],
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
    expect(framework.getAttribute("href")).toBe("/subcategories/frameworks");
  });

  it("遅い取得は新しい絞り込みを上書きしない", async () => {
    stubBrowser();
    let finishFirst: (response: Response) => void = () => undefined;
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        if (calls === 1) {
          return new Promise<Response>((resolve, reject) => {
            finishFirst = resolve;
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }
        return Promise.resolve(
          Response.json({
            success: true,
            data: [
              {
                id: "backend",
                name: "バックエンド",
                subcategoryCount: 1,
                subcategories: [
                  {
                    id: "sub",
                    name: "フレームワーク",
                    techs: [{ id: "tech-2", name: "Workers", status: "adopted", memoCount: 1 }],
                  },
                ],
              },
            ],
            error: null,
          }),
        );
      }),
    );

    render(
      <MantineProvider>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    await userEvent.type(screen.getByLabelText("キーワード"), "w");
    expect(await screen.findByText("Workers 採用中")).toBeTruthy();
    await act(async () => {
      finishFirst(
        Response.json({
          success: true,
          data: [
            {
              id: "backend",
              name: "バックエンド",
              subcategoryCount: 1,
              subcategories: [
                {
                  id: "sub",
                  name: "フレームワーク",
                  techs: [{ id: "tech-1", name: "Hono", status: "unrated", memoCount: 1 }],
                },
              ],
            },
          ],
          error: null,
        }),
      );
    });
    expect(screen.queryByText("Hono 未評価")).toBeNull();
    expect(screen.queryByText("通信に失敗しました")).toBeNull();
    expect(screen.getByText("Workers 採用中")).toBeTruthy();
  });

  it("状態とキーワードの欄は同じ幅である", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: true, data: [], error: null })),
    );
    render(
      <MantineProvider>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByRole("textbox", { name: "キーワード" })).toBeTruthy();
    const statusWidth = fieldWidth("combobox", "状態");
    const keywordWidth = fieldWidth("textbox", "キーワード");
    expect(statusWidth).toBe(keywordWidth);
    expect(statusWidth).toBe("16rem");
  });
});

function fieldWidth(role: "combobox" | "textbox", name: string): string {
  const control = screen.getByRole(role, { name });
  const root = control.closest(".mantine-Select-root, .mantine-TextInput-root");
  if (!(root instanceof HTMLElement)) {
    return "";
  }
  return root.style.width;
}

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
