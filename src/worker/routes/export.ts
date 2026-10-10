import type { Hono } from "hono";
import { exportMarkdown, loadExportBundle } from "../db/export-data";
import { fail, ok } from "../http";

export function registerExportRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/export", async (c) => {
    const format = c.req.query("format");
    const bundle = await loadExportBundle(c.env.DB);
    if (format === "json") {
      return c.json(ok(bundle));
    }
    if (format === "markdown") {
      return c.text(exportMarkdown(bundle), 200, {
        "content-type": "text/markdown; charset=utf-8",
      });
    }
    return c.json(fail("invalid", "書き出しの形式が不正です"), 400);
  });
}
