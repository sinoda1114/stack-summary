import type { Hono } from "hono";
import { loadRelationGraph } from "../db/tech-relations";
import { ok } from "../http";

export function registerRelationRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/relations", async (c) => {
    return c.json(ok(await loadRelationGraph(c.env.DB)));
  });
}
