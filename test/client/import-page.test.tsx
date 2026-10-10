import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportPage } from "../../src/client/pages/ImportPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("取り込み画面", () => {
  it("貼り付けを送り、履歴の失敗を出す", async () => {
    mockMatch(false);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return json({
          success: true,
          data: importRow("queued"),
          error: null,
        });
      }
      if (url.endsWith("/api/imports")) {
        return json({
          success: true,
          data: [importRow("failed")],
          error: null,
        });
      }
      throw new Error(url);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MantineProvider>
        <ImportPage />
      </MantineProvider>,
    );

    expect(await screen.findByText("失敗")).toBeTruthy();
    expect(screen.getByText("分けて貼ってください")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("貼り付け"), "Hono");
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(await screen.findByText("取り込みを開始しました")).toBeTruthy();
  });

  it("767px 以下では貼り付け欄を出さない", async () => {
    mockMatch(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ success: true, data: [], error: null }),
      ),
    );
    render(
      <MantineProvider>
        <ImportPage />
      </MantineProvider>,
    );
    expect(await screen.findByText("この幅では取り込みを出しません。")).toBeTruthy();
    expect(screen.queryByLabelText("貼り付け")).toBeNull();
  });
});

function importRow(status: "queued" | "failed") {
  return {
    id: "import-1",
    status,
    memoCount: status === "queued" ? 1 : 0,
    skippedCount: 0,
    error: status === "failed" ? "分けて貼ってください" : null,
    sourceLabel: null,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function mockMatch(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}
