import { createMiddleware } from "hono/factory";
import { fail, FORBIDDEN_MESSAGE } from "../http";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function originMatches(
  origin: string | undefined,
  appOrigin: string,
): boolean {
  const expected = appOrigin.trim();
  if (expected.length === 0 || origin === undefined) {
    return false;
  }
  return origin === expected;
}

export const originCheck = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    if (!MUTATING.has(c.req.method)) {
      await next();
      return undefined;
    }
    if (!originMatches(c.req.header("origin"), c.env.APP_ORIGIN)) {
      return c.json(fail("forbidden", FORBIDDEN_MESSAGE), 403);
    }
    await next();
    return undefined;
  },
);
