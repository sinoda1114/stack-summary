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
        return json(
          {
            success: true,
            data: importRow("queued"),
            error: null,
          },
          202,
        );
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

  it("開始したあとに履歴取得が失敗しても、開始の文言は残す", async () => {
    mockMatch(false);
    let listCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return json(
            {
              success: true,
              data: importRow("queued"),
              error: null,
            },
            202,
          );
        }
        listCalls += 1;
        if (listCalls === 1) {
          return json({ success: true, data: [], error: null });
        }
        return json(
          {
            success: false,
            data: null,
            error: { code: "failed", message: "取り込み履歴を取得できませんでした" },
          },
          500,
        );
      }),
    );
    render(
      <MantineProvider>
        <ImportPage />
      </MantineProvider>,
    );
    const pasted = await screen.findByLabelText("貼り付け");
    await userEvent.type(pasted, "Hono");
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(await screen.findByText("取り込みを開始しました")).toBeTruthy();
    expect(screen.getByText("取り込み履歴を取得できませんでした")).toBeTruthy();
    expect(screen.getByLabelText("貼り付け")).toHaveProperty("value", "");
  });

  it("同じ原文と処理中は開始したと出さない", async () => {
    mockMatch(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return json({
            success: true,
            data: importRow("done"),
            error: null,
          });
        }
        return json({ success: true, data: [], error: null });
      }),
    );
    render(
      <MantineProvider>
        <ImportPage />
      </MantineProvider>,
    );
    await userEvent.type(await screen.findByLabelText("貼り付け"), "Hono");
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(await screen.findByText("同じ原文です")).toBeTruthy();
  });

  it("処理中の原文は処理中と出す", async () => {
    mockMatch(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return json({
            success: true,
            data: importRow("processing"),
            error: null,
          });
        }
        return json({ success: true, data: [], error: null });
      }),
    );
    render(
      <MantineProvider>
        <ImportPage />
      </MantineProvider>,
    );
    await userEvent.type(await screen.findByLabelText("貼り付け"), "Hono");
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(await screen.findByText("処理中です")).toBeTruthy();
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

function importRow(status: "queued" | "processing" | "done" | "failed") {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
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
