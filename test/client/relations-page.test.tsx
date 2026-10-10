import { MantineProvider } from "@mantine/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { RelationsPage } from "../../src/client/pages/RelationsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("関係", () => {
  it("ノードから技術詳細へ行き、矢印のラベルは kind である", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: {
            nodes: [
              { id: "hono", name: "Hono" },
              { id: "workers", name: "Cloudflare Workers" },
            ],
            edges: [{ fromId: "hono", toId: "workers", kind: "runs_on" }],
          },
          error: null,
        }),
      ),
    );
    render(
      <MantineProvider>
        <MemoryRouter>
          <RelationsPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    const hono = await screen.findByRole("link", { name: "Hono" });
    expect(hono.getAttribute("href")).toBe("/techs/hono");
    expect(screen.getByRole("link", { name: "Cloudflare Workers" }).getAttribute("href")).toBe(
      "/techs/workers",
    );
    expect(screen.getByText("runs_on")).toBeTruthy();
    expect(document.querySelector("animate")).toBeNull();
  });

  it("関係が無いときはその旨を出す", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: { nodes: [], edges: [] },
          error: null,
        }),
      ),
    );
    render(
      <MantineProvider>
        <MemoryRouter>
          <RelationsPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByText("関係はまだありません")).toBeTruthy();
  });

  it("取得が終わるまでは読み込み中と出す", async () => {
    stubBrowser();
    let finish: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    render(
      <MantineProvider>
        <MemoryRouter>
          <RelationsPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByText("読み込み中")).toBeTruthy();
    expect(screen.queryByText("関係はまだありません")).toBeNull();
    await act(async () => {
      finish(
        Response.json({
          success: true,
          data: { nodes: [], edges: [] },
          error: null,
        }),
      );
    });
    expect(await screen.findByText("関係はまだありません")).toBeTruthy();
    expect(screen.queryByText("読み込み中")).toBeNull();
  });
});

function stubBrowser(): void {
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
