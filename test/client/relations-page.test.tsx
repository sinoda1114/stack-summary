import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
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
