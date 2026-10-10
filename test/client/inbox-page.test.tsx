import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { InboxPage } from "../../src/client/pages/InboxPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("受け箱", () => {
  it("狭い幅では保存操作を出さない", async () => {
    stubMatch(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (String(input).includes("unrated")) {
          return Response.json({
            success: true,
            data: [{ id: "tech-1", name: "Hono", status: "unrated" }],
          });
        }
        return Response.json({ success: true, data: [] });
      }),
    );
    render(
      <MantineProvider>
        <MemoryRouter>
          <InboxPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByText("Hono")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存して次へ" })).toBeNull();
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
