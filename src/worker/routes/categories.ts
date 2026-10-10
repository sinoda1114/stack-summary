import type { Hono } from "hono";
import { createCategory, listCategoryItems, patchCategory } from "../db/taxonomy-admin";
import { fail, isRecord, ok } from "../http";

export function registerCategoryRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/categories", async (c) => {
    return c.json(ok(await listCategoryItems(c.env.DB)));
  });

  app.post("/api/categories", async (c) => {
    const body = await readRecord(c.req.raw);
    if (body === null || typeof body.name !== "string") {
      return c.json(fail("invalid", "大分類名がありません"), 400);
    }
    const created = await createCategory(c.env.DB, {
      name: body.name,
      now: new Date().toISOString(),
    });
    if (!created.ok) {
      const status = created.code === "name_taken" ? 409 : 400;
      return c.json(fail(created.code, "大分類を作れません"), status);
    }
    return c.json(ok({ id: created.id }), 201);
  });

  app.patch("/api/categories/:id", async (c) => {
    const body = await readRecord(c.req.raw);
    if (body === null) {
      return c.json(fail("invalid", "更新内容がありません"), 400);
    }
    const patch: { name?: string; sortOrder?: number } = {};
    if ("name" in body) {
      if (typeof body.name !== "string") {
        return c.json(fail("invalid", "大分類名が不正です"), 400);
      }
      patch.name = body.name;
    }
    if ("sortOrder" in body) {
      if (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder)) {
        return c.json(fail("invalid", "並び順が不正です"), 400);
      }
      patch.sortOrder = body.sortOrder;
    }
    const updated = await patchCategory(c.env.DB, c.req.param("id"), patch);
    if (!updated.ok) {
      const status = updated.code === "name_taken" ? 409 : updated.code === "not_found" ? 404 : 400;
      return c.json(fail(updated.code, "大分類を更新できません"), status);
    }
    return c.json(ok({ id: c.req.param("id") }));
  });
}

async function readRecord(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}
