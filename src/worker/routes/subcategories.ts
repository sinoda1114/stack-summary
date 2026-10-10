import type { Hono } from "hono";
import { loadSubcategoryComparison } from "../db/tech-detail";
import { fail, ok } from "../http";

export function registerSubcategoryRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/subcategories/:id", async (c) => {
    const comparison = await loadSubcategoryComparison(c.env.DB, c.req.param("id"));
    if (comparison === null) {
      return c.json(fail("not_found", "小分類が見つかりません"), 404);
    }
    return c.json(ok(comparison));
  });
}
