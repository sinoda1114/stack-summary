import { Hono } from "hono";
import { clientDocumentResponse, isClientDocumentPath } from "./client-document";
import { fail, ok } from "./http";
import { accessAuth } from "./middleware/access-auth";
import { originCheck } from "./middleware/origin-check";
import { registerCategoryRoutes } from "./routes/categories";
import { registerImportRoutes } from "./routes/imports";
import { registerInboxRoutes } from "./routes/inbox";
import { registerOverviewRoutes } from "./routes/overview";
import { registerSubcategoryRoutes } from "./routes/subcategories";
import { registerTechRoutes } from "./routes/techs";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  if (isApiPath(c.req.path)) {
    return accessAuth(c, next);
  }
  await next();
  return;
});

app.use("/api/*", originCheck);

app.get("/api/health", (c) => {
  return c.json(ok({ ok: true }));
});

registerCategoryRoutes(app);
registerImportRoutes(app);
registerInboxRoutes(app);
registerOverviewRoutes(app);
registerTechRoutes(app);
registerSubcategoryRoutes(app);

app.notFound(async (c) => {
  if (
    isDocumentMethod(c.req.method) &&
    !isApiPath(c.req.path) &&
    isClientDocumentPath(c.req.path)
  ) {
    return clientDocumentResponse(c.req.raw, c.env);
  }
  return c.json(fail("not_found", "見つかりません"), 404);
});

function isDocumentMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function isApiPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return path === "/api" || path.startsWith("/api/");
}
