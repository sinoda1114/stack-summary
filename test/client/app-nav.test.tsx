import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { AppNav } from "../../src/client/components/AppNav";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("画面ナビ", () => {
  it("左のサイドバーに6項目を出す", () => {
    stubDesktop();
    render(
      <MantineProvider>
        <MemoryRouter>
          <AppNav />
        </MemoryRouter>
      </MantineProvider>,
    );

    expect(document.querySelector("aside.sidebar")).toBeTruthy();
    expect(document.querySelector("header.masthead")).toBeNull();
    expect(screen.getByRole("navigation", { name: "画面" })).toBeTruthy();
    for (const label of ["全体図", "取り込み", "メモ", "受け箱", "分類", "書き出し"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("狭い幅では管理の項目を出さない", () => {
    stubMobile();
    render(
      <MantineProvider>
        <MemoryRouter>
          <AppNav />
        </MemoryRouter>
      </MantineProvider>,
    );

    expect(screen.getByRole("link", { name: "全体図" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "取り込み" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "メモ" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "受け箱" })).toBeNull();
    expect(screen.queryByRole("link", { name: "分類" })).toBeNull();
    expect(screen.queryByRole("link", { name: "書き出し" })).toBeNull();
  });
});

function stubDesktop(): void {
  stubMatch(false);
}

function stubMobile(): void {
  stubMatch(true);
}

function stubMatch(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("max-width") ? matches : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  );
}
