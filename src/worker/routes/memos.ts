import type { Hono } from "hono";
import { loadMemoDetail, parseMemoSearchCursor, searchMemos } from "../db/memo-search";
import { fail, ok } from "../http";

export function registerMemoRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/memos", async (c) => {
    const cursorText = c.req.query("cursor");
    if (
      cursorText !== undefined &&
      cursorText.length > 0 &&
      parseMemoSearchCursor(cursorText) === null
    ) {
      return c.json(fail("invalid", "検索の続きが不正です"), 400);
    }
    const page = await searchMemos(c.env.DB, {
      q: c.req.query("q") ?? "",
      tag: c.req.query("tag") ?? "",
      cursor: cursorText ?? null,
    });
    return c.json(ok(page));
  });

  app.get("/api/memos/:id", async (c) => {
    const detail = await loadMemoDetail(c.env.DB, c.req.param("id"));
    if (detail === null) {
      return c.json(fail("not_found", "メモが見つかりません"), 404);
    }
    return c.json(ok(detail));
  });
}
