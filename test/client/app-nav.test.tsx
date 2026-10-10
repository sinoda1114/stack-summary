import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { AppNav } from "../../src/client/components/AppNav";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("画面ナビ", () => {
  it("左のサイドバーに7項目を出す", () => {
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
    expect(document.querySelector("header.mobile-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: "メニューを開く" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "画面" })).toBeTruthy();
    for (const label of ["全体図", "関係", "取り込み", "メモ", "受け箱", "分類", "書き出し"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("768px 以下でメニューを出す", () => {
    const queries: string[] = [];
    vi.stubGlobal(
      "matchMedia",
      (query: string) => {
        queries.push(query);
        return {
          matches: query === "(max-width: 768px)",
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        };
      },
    );
    renderNav();

    expect(queries).toContain("(max-width: 768px)");
    expect(screen.getByRole("button", { name: "メニューを開く" })).toBeTruthy();
    expect(document.querySelector("aside.sidebar")).toBeNull();
  });

  it("狭い幅ではサイドバーを隠し、メニューからドロワーを開く", async () => {
    stubMobile();
    renderNav();

    expect(document.querySelector("aside.sidebar")).toBeNull();
    expect(screen.queryByRole("link", { name: "全体図" })).toBeNull();
    const menu = screen.getByRole("button", { name: "メニューを開く" });
    expect(menu.textContent).toContain("☰");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".mobile-title")?.textContent).toBe("全体図");

    await userEvent.click(menu);

    expect(screen.getByRole("dialog", { name: "メニュー" })).toBeTruthy();
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "全体図" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "関係" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "取り込み" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "メモ" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "受け箱" })).toBeNull();
    expect(screen.queryByRole("link", { name: "分類" })).toBeNull();
    expect(screen.queryByRole("link", { name: "書き出し" })).toBeNull();
  });

  it("狭い幅では外側か項目でドロワーを閉じる", async () => {
    stubMobile();
    renderNav();

    const menu = screen.getByRole("button", { name: "メニューを開く" });
    await userEvent.click(menu);
    const scrim = document.querySelector(".drawer-scrim");
    if (scrim === null) {
      throw new Error("背景がありません");
    }
    await userEvent.click(scrim);
    expect(document.querySelector("aside.sidebar")).toBeNull();
    expect(menu.getAttribute("aria-expanded")).toBe("false");

    await userEvent.click(menu);
    await userEvent.click(screen.getByRole("link", { name: "メモ" }));
    expect(document.querySelector("aside.sidebar")).toBeNull();
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".mobile-title")?.textContent).toBe("メモ");

    await userEvent.click(menu);
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector("aside.sidebar")).toBeNull();
    expect(menu.getAttribute("aria-expanded")).toBe("false");
  });

  it("狭い幅では経路に応じた画面名を出す", () => {
    stubMobile();
    renderNav("/techs/hono");
    expect(document.querySelector(".mobile-title")?.textContent).toBe("技術");
  });
});

function renderNav(path = "/"): void {
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppNav />
      </MemoryRouter>
    </MantineProvider>,
  );
}

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
