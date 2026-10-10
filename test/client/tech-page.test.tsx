import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { TechPage } from "../../src/client/pages/TechPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("技術詳細", () => {
  it("状態は5値のまま保存する", async () => {
    stubBrowser();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const sent = JSON.parse(String(init.body)) as { status?: string; reason?: string };
        return Response.json({
          success: true,
          data: detail(sent.status ?? "", sent.reason ?? ""),
          error: null,
        });
      }
      return Response.json({ success: true, data: detail("adopted", "速い"), error: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/techs/tech-1"]}>
          <Routes>
            <Route path="/techs/:id" element={<TechPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );

    expect(await screen.findByRole("combobox", { name: "状態" })).toHaveProperty("value", "採用中");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    const patch = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH");
    expect(patch?.[1]?.body).toBe(JSON.stringify({ status: "adopted", reason: "速い" }));
  });

  it("通信に失敗したら日本語で知らせる", async () => {
    stubBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );

    render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/techs/tech-1"]}>
          <Routes>
            <Route path="/techs/:id" element={<TechPage />} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );

    expect(await screen.findByText("通信に失敗しました")).toBeTruthy();
  });
});

function detail(status: string, reason: string) {
  return {
    name: "Hono",
    status,
    reason,
    updatedAt: "2026-10-10",
    aliases: [],
    memos: [],
  };
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
