import type { Hono } from "hono";
import type { TechStatus } from "../../shared/labels";
import { addUserAlias, deleteUserAlias } from "../db/aliases";
import { mergeTech } from "../db/merge-tech";
import { isTechStatus, listTechSummaries, loadTechDetail, patchTech } from "../db/tech-detail";
import { fail, ok, readRecord } from "../http";

type TechPatch = {
  status?: TechStatus;
  reason?: string | null;
  categoryId?: string | null;
  subcategoryIds?: string[];
  tags?: { name: string; kind: "topic" | "vendor" | "project" }[];
};

const TAG_KINDS = ["topic", "vendor", "project"] as const;

export function registerTechRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/techs", async (c) => {
    return c.json(ok(await listTechSummaries(c.env.DB)));
  });

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

  app.post("/api/techs/:id/merge", async (c) => {
    const body = await readRecord(c.req.raw);
    if (body === null || typeof body.intoId !== "string" || body.intoId.length === 0) {
      return c.json(fail("invalid", "統合先がありません"), 400);
    }
    const reasonChoice = body.reasonChoice;
    if (
      reasonChoice !== undefined &&
      reasonChoice !== "into" &&
      reasonChoice !== "source"
    ) {
      return c.json(fail("invalid", "残す理由の指定が不正です"), 400);
    }
    const merged = await mergeTech(c.env.DB, {
      sourceId: c.req.param("id"),
      intoId: body.intoId,
      reasonChoice,
      now: new Date().toISOString(),
    });
    if (!merged.ok) {
      return c.json(fail(merged.code, mergeMessage(merged.code)), mergeStatus(merged.code));
    }
    return c.json(ok({ intoId: body.intoId }));
  });

  app.post("/api/techs/:id/aliases", async (c) => {
    const body = await readRecord(c.req.raw);
    if (body === null || typeof body.alias !== "string") {
      return c.json(fail("invalid", "別名がありません"), 400);
    }
    const added = await addUserAlias(c.env.DB, c.req.param("id"), body.alias);
    if (!added.ok) {
      const status = added.code === "alias_taken" ? 409 : added.code === "not_found" ? 404 : 400;
      return c.json(fail(added.code, "別名を追加できません"), status);
    }
    return c.json(ok({ key: added.key }));
  });

  app.delete("/api/techs/:id/aliases/:key", async (c) => {
    const removed = await deleteUserAlias(
      c.env.DB,
      c.req.param("id"),
      c.req.param("key"),
    );
    if (!removed.ok) {
      const status = removed.code === "not_found" ? 404 : 400;
      return c.json(fail(removed.code, "別名を削除できません"), status);
    }
    return c.json(ok({ deleted: true }));
  });
}

function mergeStatus(code: "self_merge" | "not_found" | "reason_conflict"): 400 | 404 | 409 {
  switch (code) {
    case "self_merge":
      return 400;
    case "not_found":
      return 404;
    case "reason_conflict":
      return 409;
    default: {
      const unexpected: never = code;
      throw new Error(`未知の統合結果です: ${String(unexpected)}`);
    }
  }
}

function mergeMessage(code: "self_merge" | "not_found" | "reason_conflict"): string {
  switch (code) {
    case "self_merge":
      return "自分自身へは統合できません";
    case "not_found":
      return "技術が見つかりません";
    case "reason_conflict":
      return "残す理由を選んでください";
    default: {
      const unexpected: never = code;
      throw new Error(`未知の統合結果です: ${String(unexpected)}`);
    }
  }
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
  if ("categoryId" in body && body.categoryId !== undefined) {
    if (body.categoryId !== null && typeof body.categoryId !== "string") {
      return { ok: false, message: "大分類の形が不正です" };
    }
    patch.categoryId = body.categoryId;
  }
  if ("subcategoryIds" in body && body.subcategoryIds !== undefined) {
    if (
      !Array.isArray(body.subcategoryIds) ||
      body.subcategoryIds.some((id) => typeof id !== "string")
    ) {
      return { ok: false, message: "小分類の形が不正です" };
    }
    patch.subcategoryIds = body.subcategoryIds;
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
