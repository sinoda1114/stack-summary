import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { FORBIDDEN_MESSAGE } from "../../src/worker/http";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("画面の直接読み込み", () => {
  it("GET /imports は SPA を返し、API の中身は含めない", async () => {
    const response = await call("/imports");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain('id="root"');
    expect(body).not.toContain("not_found");
  });

  it("末尾スラッシュの /imports/ も SPA", async () => {
    const response = await call("/imports/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="root"');
  });

  it("JWT が無い API は 403", async () => {
    const response = await call("/api/health");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code: "forbidden", message: FORBIDDEN_MESSAGE },
    });
  });

  it("技術詳細と小分類の直接読み込みは SPA", async () => {
    const tech = await call("/techs/tech_1");
    const subcategory = await call("/subcategories/sub_1");
    expect(tech.status).toBe(200);
    expect(subcategory.status).toBe(200);
    expect(await tech.text()).toContain('id="root"');
    expect(await subcategory.text()).toContain('id="root"');
  });

  it("識別子が無い詳細経路は JSON 404", async () => {
    const response = await call("/techs");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("受け箱と分類管理の直接読み込みは SPA", async () => {
    const inbox = await call("/inbox");
    const taxonomy = await call("/taxonomy");
    expect(inbox.status).toBe(200);
    expect(taxonomy.status).toBe(200);
    expect(await inbox.text()).toContain('id="root"');
    expect(await taxonomy.text()).toContain('id="root"');
  });

  it("まだ画面が無い経路は JSON 404", async () => {
    const response = await call("/export");
    expect(response.status).toBe(404);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      success: false,
      error: { code: "not_found" },
    });
  });

  it("POST /imports は HTML にしない", async () => {
    const response = await call("/imports", "POST");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

async function call(path: string, method = "GET"): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new IncomingRequest(`https://stack.example${path}`, { method }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
