import type { Hono } from "hono";
import {
  createUserSubcategory,
  listSubcategoryChoices,
  mergeSubcategory,
  patchSubcategory,
} from "../db/subcategory-admin";
import { loadSubcategoryComparison } from "../db/tech-detail";
import { fail, ok, readRecord } from "../http";

export function registerSubcategoryRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/subcategories", async (c) => {
    return c.json(ok(await listSubcategoryChoices(c.env.DB)));
  });

  app.post("/api/subcategories", async (c) => {
    const body = await readRecord(c.req.raw);
    if (body === null || typeof body.categoryId !== "string" || typeof body.name !== "string") {
      return c.json(fail("invalid", "小分類の指定が不正です"), 400);
    }
    const created = await createUserSubcategory(c.env.DB, {
      categoryId: body.categoryId,
      name: body.name,
      now: new Date().toISOString(),
    });
    if (!created.ok) {
      const status = created.code === "name_taken" ? 409 : created.code === "not_found" ? 404 : 400;
      return c.json(fail(created.code, "小分類を作れません"), status);
    }
    return c.json(ok({ id: created.id }), 201);
  });

  app.patch("/api/subcategories/:id", async (c) => {
    const body = await readRecord(c.req.raw);
    if (body === null) {
      return c.json(fail("invalid", "更新内容がありません"), 400);
    }
    const patch: { name?: string; categoryId?: string; reviewed?: boolean } = {};
    if ("name" in body) {
      if (typeof body.name !== "string") {
        return c.json(fail("invalid", "小分類名が不正です"), 400);
      }
      patch.name = body.name;
    }
    if ("categoryId" in body) {
      if (typeof body.categoryId !== "string") {
        return c.json(fail("invalid", "大分類が不正です"), 400);
      }
      patch.categoryId = body.categoryId;
    }
    if ("reviewed" in body) {
      if (body.reviewed !== true) {
        return c.json(fail("invalid", "確認の指定が不正です"), 400);
      }
      patch.reviewed = true;
    }
    const updated = await patchSubcategory(c.env.DB, c.req.param("id"), patch);
    if (!updated.ok) {
      const status = updated.code === "name_taken" ? 409 : updated.code === "not_found" ? 404 : 400;
      return c.json(fail(updated.code, "小分類を更新できません"), status);
    }
    return c.json(ok({ id: c.req.param("id") }));
  });

  app.post("/api/subcategories/:id/merge", async (c) => {
    const body = await readRecord(c.req.raw);
    if (body === null || typeof body.intoId !== "string") {
      return c.json(fail("invalid", "統合先がありません"), 400);
    }
    const merged = await mergeSubcategory(c.env.DB, {
      sourceId: c.req.param("id"),
      intoId: body.intoId,
      now: new Date().toISOString(),
    });
    if (!merged.ok) {
      const status = merged.code === "not_found" ? 404 : 400;
      return c.json(fail(merged.code, "小分類を統合できません"), status);
    }
    return c.json(ok({ intoId: body.intoId }));
  });

  app.get("/api/subcategories/:id", async (c) => {
    const comparison = await loadSubcategoryComparison(c.env.DB, c.req.param("id"));
    if (comparison === null) {
      return c.json(fail("not_found", "小分類が見つかりません"), 404);
    }
    return c.json(ok(comparison));
  });
}

