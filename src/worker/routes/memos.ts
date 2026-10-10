import type { Hono } from "hono";
import { loadMemoDetail, searchMemos } from "../db/memo-search";
import { fail, ok } from "../http";

export function registerMemoRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/memos", async (c) => {
    const memos = await searchMemos(c.env.DB, {
      q: c.req.query("q") ?? "",
      tag: c.req.query("tag") ?? "",
    });
    return c.json(ok(memos));
  });

  app.get("/api/memos/:id", async (c) => {
    const detail = await loadMemoDetail(c.env.DB, c.req.param("id"));
    if (detail === null) {
      return c.json(fail("not_found", "メモが見つかりません"), 404);
    }
    return c.json(ok(detail));
  });
}
