import type { Hono } from "hono";
import { promoteMention } from "../db/promote-mention";
import { fail, isRecord, ok } from "../http";

export function registerMentionRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/mentions/promote", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(fail("invalid", "JSON ではありません"), 400);
    }
    if (!isRecord(body) || typeof body.memoId !== "string" || typeof body.name !== "string") {
      return c.json(fail("invalid", "格上げの指定が不正です"), 400);
    }
    const promoted = await promoteMention(c.env.DB, {
      memoId: body.memoId,
      name: body.name,
      now: new Date().toISOString(),
    });
    if (!promoted.ok) {
      const status = promoted.code === "not_found" ? 404 : promoted.code === "conflict" ? 409 : 400;
      return c.json(fail(promoted.code, "言及を格上げできません"), status);
    }
    return c.json(ok({ techId: promoted.techId, relation: promoted.relation }));
  });
}
