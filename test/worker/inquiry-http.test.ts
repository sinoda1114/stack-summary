import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker/index";
import { FORBIDDEN_MESSAGE } from "../../src/worker/http";

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

describe("問い合わせ API", () => {
  it("Origin が無い更新は 403、空の質問は 400", async () => {
    const missingOrigin = await call({
      origin: null,
      body: JSON.stringify({ question: "Hono は？" }),
    });
    expect(missingOrigin.status).toBe(403);
    expect(await missingOrigin.json()).toEqual({
      success: false,
      data: null,
      error: { code: "forbidden", message: FORBIDDEN_MESSAGE },
    });

    const empty = await call({
      origin: "https://stack.example.com",
      body: JSON.stringify({ question: "  " }),
    });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({
      success: false,
      data: null,
      error: { code: "empty", message: "質問が空です" },
    });
  });
});

async function call(input: {
  origin: string | null;
  body: string;
}): Promise<Response> {
  const token = await new SignJWT({ email: OWNER_EMAIL })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(TEAM_DOMAIN)
    .setAudience(AUDIENCE)
    .setExpirationTime("2h")
    .sign(privateKey);
  const headers = new Headers({
    "cf-access-jwt-assertion": token,
    "content-type": "application/json",
  });
  if (input.origin !== null) {
    headers.set("origin", input.origin);
  }
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new IncomingRequest("https://stack.example.com/api/inquiries", {
      method: "POST",
      headers,
      body: input.body,
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
