import type { Hono } from "hono";
import type { TechStatus } from "../../shared/labels";
import { isTechStatus, loadTechDetail, patchTech } from "../db/tech-detail";
import { fail, ok } from "../http";

type TechPatch = {
  status?: TechStatus;
  reason?: string | null;
  subcategoryId?: string | null;
  tags?: { name: string; kind: "topic" | "vendor" | "project" }[];
};

const TAG_KINDS = ["topic", "vendor", "project"] as const;

export function registerTechRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/techs/:id", async (c) => {
    const detail = await loadTechDetail(c.env.DB, c.req.param("id"));
    if (detail === null) {
      return c.json(fail("not_found", "技術が見つかりません"), 404);
    }
    return c.json(ok(detail));
  });

  app.patch("/api/techs/:id", async (c) => {
    const parsed = await readPatch(c.req.raw);
    if (!parsed.ok) {
      return c.json(fail("invalid", parsed.message), 400);
    }
    try {
      const updated = await patchTech(
        c.env.DB,
        c.req.param("id"),
        parsed.patch,
        new Date().toISOString(),
      );
      if (!updated) {
        return c.json(fail("not_found", "技術が見つかりません"), 404);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新できませんでした";
      return c.json(fail("invalid", message), 400);
    }
    const detail = await loadTechDetail(c.env.DB, c.req.param("id"));
    return c.json(ok(detail));
  });
}

async function readPatch(
  request: Request,
): Promise<{ ok: true; patch: TechPatch } | { ok: false; message: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, message: "JSON ではありません" };
  }
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "更新内容がありません" };
  }
  const patch: TechPatch = {};
  if ("status" in body && body.status !== undefined) {
    if (typeof body.status !== "string" || !isTechStatus(body.status)) {
      return { ok: false, message: "状態の指定が不正です" };
    }
    patch.status = body.status;
  }
  if ("reason" in body && body.reason !== undefined) {
    if (body.reason !== null && typeof body.reason !== "string") {
      return { ok: false, message: "理由の形が不正です" };
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;
    patch.reason = reason === null || reason.length === 0 ? null : reason;
  }
  if ("subcategoryId" in body && body.subcategoryId !== undefined) {
    if (body.subcategoryId !== null && typeof body.subcategoryId !== "string") {
      return { ok: false, message: "小分類の形が不正です" };
    }
    patch.subcategoryId = body.subcategoryId;
  }
  if ("tags" in body && body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return { ok: false, message: "タグの形が不正です" };
    }
    const tags: { name: string; kind: "topic" | "vendor" | "project" }[] = [];
    for (const tag of body.tags) {
      if (typeof tag !== "object" || tag === null || !("name" in tag) || !("kind" in tag)) {
        return { ok: false, message: "タグの形が不正です" };
      }
      if (typeof tag.name !== "string" || typeof tag.kind !== "string") {
        return { ok: false, message: "タグの形が不正です" };
      }
      if (!TAG_KINDS.some((kind) => kind === tag.kind)) {
        return { ok: false, message: "タグの種類が不正です" };
      }
      tags.push({ name: tag.name, kind: tag.kind });
    }
    patch.tags = tags;
  }
  return { ok: true, patch };
}
