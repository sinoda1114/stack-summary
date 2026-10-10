import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
} from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker/index";
import { FORBIDDEN_MESSAGE } from "../../src/worker/http";
import { verifyAccessJwt } from "../../src/worker/middleware/access-auth";

const TEAM_DOMAIN = "https://team.cloudflareaccess.com";
const AUDIENCE = "test-aud";
const OWNER_EMAIL = "owner@example.com";
const CERTS_URL = `${TEAM_DOMAIN}/cdn-cgi/access/certs`;

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  privateKey = keys.privateKey;
  publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = "test";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const original = globalThis.fetch.bind(globalThis);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === CERTS_URL) {
      return Response.json({ keys: [publicJwk] });
    }
    return original(input, init);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("JWT が無いとき 403 になり、本人へ読み替えない", async () => {
    const response = await call("/api/health");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code: "forbidden", message: FORBIDDEN_MESSAGE },
    });
  });

  it("空の JWT も 403", async () => {
    const response = await call("/api/health", { token: "   " });
    expect(response.status).toBe(403);
  });

  it("Cookie だけでは通さない", async () => {
    const token = await sign();
    const headers = new Headers({ cookie: `CF_Authorization=${token}` });
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new IncomingRequest("https://stack.example/api/health", { headers }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(403);
  });

  it("不正な JWT は 403", async () => {
    const response = await call("/api/health", { token: "not-a-jwt" });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("not-a-jwt");
  });

  it("別メール、別 aud、期限切れ、別の発行者は 403", async () => {
    const cases = [
      await sign({ email: "other@example.com" }),
      await sign({ audience: "other-aud" }),
      await sign({ expiresIn: "-1h" }),
      await sign({ issuer: "https://evil.example" }),
    ];
    for (const token of cases) {
      const response = await call("/api/health", { token });
      expect(response.status).toBe(403);
    }
  });

  it("OWNER_EMAIL が空なら認証を通さず JSON を返す", async () => {
    const token = await sign();
    const response = await call("/api/health", {
      token,
      env: { OWNER_EMAIL: "" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { ok: true },
      error: null,
    });
  });

  it("OWNER_EMAIL が未設定でも 500 にせず JSON を返す", async () => {
    const response = await call("/api/health", {
      env: { OWNER_EMAIL: undefined },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain("application/json");
    expect(await response.json()).toEqual({
      success: true,
      data: { ok: true },
      error: null,
    });
  });

  it("プレビューフラグがあっても、Access 設定があるときは JWT が要る", async () => {
    const response = await call("/api/health", {
      env: { PREVIEW_OPEN: "1" },
    });
    expect(response.status).toBe(403);
  });

  it("OWNER_EMAIL があり Access 設定が欠け、プレビューフラグがあるときは JSON を返す", async () => {
    const response = await call("/api/health", {
      env: {
        PREVIEW_OPEN: "1",
        ACCESS_TEAM_DOMAIN: "",
        ACCESS_AUD: "",
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { ok: true },
      error: null,
    });
  });

  it("OWNER_EMAIL があり Access 設定が欠け、プレビューフラグが無いときは 403", async () => {
    const response = await call("/api/health", {
      env: { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" },
    });
    expect(response.status).toBe(403);
  });

  it("プレビューフラグが 1 以外なら、Access 設定が欠けていても 403", async () => {
    const response = await call("/api/health", {
      env: {
        PREVIEW_OPEN: "true",
        ACCESS_TEAM_DOMAIN: "",
        ACCESS_AUD: "",
      },
    });
    expect(response.status).toBe(403);
  });

  it("有効な JWT では 200", async () => {
    const response = await call("/api/health", { token: await sign() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { ok: true },
      error: null,
    });
  });

  it("メールの大文字小文字は無視する", async () => {
    const response = await call("/api/health", {
      token: await sign({ email: "Owner@Example.com" }),
    });
    expect(response.status).toBe(200);
  });
});

describe("/api のその他", () => {
  it("JWT が無い /api は 403", async () => {
    const response = await call("/api");
    expect(response.status).toBe(403);
  });

  it("大文字の /API も 403", async () => {
    const response = await call("/API/health");
    expect(response.status).toBe(403);
  });

  it("パーセント符号化された /api も 403", async () => {
    const response = await call("/%61pi/health");
    expect(response.status).toBe(403);
  });

  it("Access 以外のチームドメインは 403", async () => {
    const response = await call("/api/health", {
      token: await sign(),
      env: { ACCESS_TEAM_DOMAIN: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("認証後に無い経路は 404", async () => {
    const response = await call("/api/missing", { token: await sign() });
    expect(response.status).toBe(404);
  });

  it("API 以外は JWT 無しでもデータを返さない", async () => {
    const response = await call("/");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code: "not_found", message: "見つかりません" },
    });
  });
});

describe("verifyAccessJwt", () => {
  it("exp が無いトークンは拒否する", async () => {
    const token = await new SignJWT({ email: OWNER_EMAIL })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(TEAM_DOMAIN)
      .setAudience(AUDIENCE)
      .sign(privateKey);
    const getKey = createLocalJWKSet({ keys: [publicJwk] });
    await expect(
      verifyAccessJwt(
        token,
        { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, ownerEmail: OWNER_EMAIL },
        getKey,
      ),
    ).rejects.toThrow();
  });
});

type SignOptions = {
  email?: string;
  audience?: string;
  issuer?: string;
  expiresIn?: string;
};

async function sign(options: SignOptions = {}): Promise<string> {
  return new SignJWT({ email: options.email ?? OWNER_EMAIL })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(options.issuer ?? TEAM_DOMAIN)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiresIn ?? "2h")
    .sign(privateKey);
}

async function call(
  path: string,
  options: { token?: string; env?: Partial<Env> & { PREVIEW_OPEN?: string } } = {},
): Promise<Response> {
  const headers = new Headers();
  if (options.token !== undefined) {
    headers.set("cf-access-jwt-assertion", options.token);
  }
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new IncomingRequest(`https://stack.example${path}`, { headers }),
    { ...env, ...options.env },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
