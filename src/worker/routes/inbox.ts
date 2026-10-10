import type { Hono } from "hono";
import {
  listUnclassifiedTechs,
  listUnratedTechs,
  listUnreviewedSubcategories,
} from "../db/inbox";
import { ok } from "../http";

export function registerInboxRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/inbox/unrated", async (c) => {
    return c.json(ok(await listUnratedTechs(c.env.DB)));
  });

  app.get("/api/inbox/unclassified", async (c) => {
    return c.json(ok(await listUnclassifiedTechs(c.env.DB)));
  });

  app.get("/api/inbox/subcategories", async (c) => {
    return c.json(ok(await listUnreviewedSubcategories(c.env.DB)));
  });
}
