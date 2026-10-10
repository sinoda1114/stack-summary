import { Hono } from "hono";
import { fail, ok } from "./http";
import { accessAuth } from "./middleware/access-auth";

export const app = new Hono<{ Bindings: Env }>();

app.use("/api", accessAuth);
app.use("/api/*", accessAuth);

app.get("/api/health", (c) => {
  return c.json(ok({ ok: true }));
});

app.notFound((c) => {
  return c.json(fail("not_found", "見つかりません"), 404);
});
