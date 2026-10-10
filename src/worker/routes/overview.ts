import type { Hono } from "hono";
import { loadOverview, type OverviewFilter } from "../db/overview";
import { isTechStatus } from "../db/tech-detail";
import { fail, ok } from "../http";

export function registerOverviewRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get("/api/overview", async (c) => {
    const filter = readFilter(c.req.query("status"), c.req.query("tag"), c.req.query("q"));
    if (filter === null) {
      return c.json(fail("invalid", "状態の指定が不正です"), 400);
    }
    return c.json(ok(await loadOverview(c.env.DB, filter)));
  });
}

function readFilter(
  status: string | undefined,
  tag: string | undefined,
  q: string | undefined,
): OverviewFilter | null {
  const trimmedStatus = status?.trim() ?? "";
  if (trimmedStatus.length === 0) {
    return { status: null, tag: blankToNull(tag), q: blankToNull(q) };
  }
  if (!isTechStatus(trimmedStatus)) {
    return null;
  }
  return { status: trimmedStatus, tag: blankToNull(tag), q: blankToNull(q) };
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}
