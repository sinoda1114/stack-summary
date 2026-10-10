import { Hono } from "hono";
import { fail, ok } from "./http";
import { accessAuth } from "./middleware/access-auth";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  if (isApiPath(new URL(c.req.url).pathname)) {
    return accessAuth(c, next);
  }
  await next();
  return;
});

app.get("/api/health", (c) => {
  return c.json(ok({ ok: true }));
});

app.notFound((c) => {
  return c.json(fail("not_found", "見つかりません"), 404);
});

function isApiPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return path === "/api" || path.startsWith("/api/");
}
