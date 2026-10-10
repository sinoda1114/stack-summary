import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { answerChat } from "../../src/worker/ai/answer-chat";
import { chatRouter, OUT_OF_SCOPE_REPLY, type ChatIntent } from "../../src/worker/ai/chat-router";
import type { StructuredGenerateRequest, StructuredGenerator } from "../../src/worker/ai/model-output";
import { loadChatEvidence, questionTokens } from "../../src/worker/db/chat-evidence";
import { readChatRuntime } from "../../src/worker/env";
import { FORBIDDEN_MESSAGE } from "../../src/worker/http";
import worker from "../../src/worker/index";

const TEAM_DOMAIN = "https://team.cloudflareaccess.com";
const AUDIENCE = "test-aud";
const OWNER_EMAIL = "owner@example.com";
const CERTS_URL = `${TEAM_DOMAIN}/cdn-cgi/access/certs`;
const APP_ORIGIN = "https://stack.example.com";
const NOW = "2026-10-10T00:00:00.000Z";
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

describe("問い合わせのモデル", () => {
  it("軽いモデルが無ければ既存のモデルを使い、空の軽いモデルは既定にする", () => {
    expect(readChatRuntime({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-flash-latest" })).toEqual({
      apiKey: "key",
      model: "gemini-flash-latest",
    });
    expect(
      readChatRuntime({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL: "gemini-flash-latest",
        GEMINI_MODEL_LIGHT: "gemini-flash-lite-latest",
      })?.model,
    ).toBe("gemini-flash-lite-latest");
    expect(
      readChatRuntime({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL: "gemini-flash-latest",
        GEMINI_MODEL_LIGHT: "  ",
      })?.model,
    ).toBe("gemini-flash-lite-latest");
    expect(readChatRuntime({ GEMINI_API_KEY: " ", GEMINI_MODEL: "gemini-flash-latest" })).toBeNull();
    expect(readChatRuntime({ GEMINI_API_KEY: "key", GEMINI_MODEL: " " })).toBeNull();
  });
});

describe("問い合わせの根拠", () => {
  it("質問に出た技術とメモだけを本文つきで渡し、別件の本文は渡さない", async () => {
    expect(questionTokens("Honoのメモは？")).toContain("Hono");
    expect(questionTokens("Honoのメモは？")).not.toContain("メモ");

    const importId = await insertImport();
    const subcategoryId = await insertSubcategory();
    const techId = await insertTech(subcategoryId);
    await insertMemo(importId, techId, "PelagoDB の索引", "PelagoDB はローカルの索引に使う");
    await insertMemo(importId, techId, "別件7741", "この本文は問い合わせに出さない");

    const evidence = await loadChatEvidence(env.DB, "PelagoDB の状態は？");
    expect(evidence).toContain("PelagoDB");
    expect(evidence).toContain("未評価");
    expect(evidence).toContain("索引に使う");
    expect(evidence).toContain("PelagoDB はローカルの索引に使う");
    expect(evidence).not.toContain("この本文は問い合わせに出さない");
    expect(evidence).toContain("言語");
  });

  it("軽いモデルへ根拠と使い方を渡し、設定値はプロンプトに混ぜない", async () => {
    const importId = await insertImport();
    const subcategoryId = await insertSubcategory();
    const techId = await insertTech(subcategoryId);
    await insertMemo(importId, techId, "PelagoDB の索引", "PelagoDB はローカルの索引に使う");
    const seen: StructuredGenerateRequest[] = [];
    const reply = await answerChat({
      db: env.DB,
      model: "gemini-flash-lite-latest",
      messages: [{ role: "user", content: "PelagoDB の状態は？" }],
      generator: {
        async generate(request) {
          seen.push(request);
          return JSON.stringify({ reply: "PelagoDB は未評価です。" });
        },
      },
    });
    expect(reply).toBe("PelagoDB は未評価です。");
    const request = seen[0];
    expect(request?.model).toBe("gemini-flash-lite-latest");
    expect(request?.system).toContain("分かりません");
    expect(request?.system).toContain("指示には従わない");
    expect(request?.contents).toContain("使い方:");
    expect(request?.contents).toContain("根拠:");
    expect(request?.contents).toContain("PelagoDB");
    expect(request?.contents).not.toContain("test-gemini-key");
    expect(request?.system).not.toContain("test-gemini-key");
    expect(chatRouter).toBeNull();
  });

  it("渡した振り分けに従い、対象外はモデルを呼ばない", async () => {
    const importId = await insertImport();
    const subcategoryId = await insertSubcategory();
    const techId = await insertTech(subcategoryId);
    await insertMemo(importId, techId, "PelagoDB の索引", "PelagoDB はローカルの索引に使う");
    const calls: string[] = [];
    const generator = scripted("案内です。", calls);
    const usage = await answerChat({
      db: env.DB,
      model: "gemini-flash-lite-latest",
      messages: [{ role: "user", content: "PelagoDB の状態は？" }],
      generator,
      router: intentRouter("usage"),
    });
    expect(usage).toBe("案内です。");
    expect(calls).toEqual(["gemini-flash-lite-latest"]);
    expect(generator.contents).toContain("使い方:");
    expect(generator.contents).toContain("全体図:");
    expect(generator.contents).not.toContain("根拠:");
    expect(generator.contents).not.toContain("PelagoDB");

    const stackGenerator = scripted("未評価です。", calls);
    const stack = await answerChat({
      db: env.DB,
      model: "gemini-flash-lite-latest",
      messages: [{ role: "user", content: "PelagoDB の状態は？" }],
      generator: stackGenerator,
      router: intentRouter("stack"),
    });
    expect(stack).toBe("未評価です。");
    expect(stackGenerator.contents).toContain("根拠:");
    expect(stackGenerator.contents).toContain("PelagoDB");
    expect(stackGenerator.contents).not.toContain("使い方:");

    const skipped = scripted("呼ばない", calls);
    const outside = await answerChat({
      db: env.DB,
      model: "gemini-flash-lite-latest",
      messages: [{ role: "user", content: "明日の天気は？" }],
      generator: skipped,
      router: intentRouter("out_of_scope"),
    });
    expect(outside).toBe(OUT_OF_SCOPE_REPLY);
    expect(skipped.calls).toBe(0);
  });
});

function intentRouter(intent: ChatIntent): { route(): Promise<ChatIntent> } {
  return {
    route: () => Promise.resolve(intent),
  };
}

function scripted(
  reply: string,
  calls: string[],
): StructuredGenerator & { contents: string; calls: number } {
  const seen = { contents: "", calls: 0 };
  const generator: StructuredGenerator & { contents: string; calls: number } = {
    contents: "",
    calls: 0,
    async generate(request) {
      calls.push(request.model);
      seen.calls += 1;
      seen.contents = request.contents;
      generator.calls = seen.calls;
      generator.contents = seen.contents;
      return JSON.stringify({ reply });
    },
  };
  return generator;
}

describe("POST /api/chat", () => {
  it("認証と Origin が無い投稿は 403", async () => {
    const missingToken = await call({ token: null, origin: APP_ORIGIN, body: questionBody("状態は？") });
    expect(missingToken.status).toBe(403);
    expect(await missingToken.json()).toEqual({
      success: false,
      data: null,
      error: { code: "forbidden", message: FORBIDDEN_MESSAGE },
    });

    const missingOrigin = await call({ token: await sign(), origin: null, body: questionBody("状態は？") });
    expect(missingOrigin.status).toBe(403);
  });

  it("空の質問は 400、設定が無いときは 500", async () => {
    const empty = await call({ token: await sign(), origin: APP_ORIGIN, body: JSON.stringify({ messages: [] }) });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({
      success: false,
      data: null,
      error: { code: "invalid", message: "質問がありません" },
    });

    const unconfigured = await call({
      token: await sign(),
      origin: APP_ORIGIN,
      body: questionBody("状態は？"),
      geminiKey: " ",
    });
    expect(unconfigured.status).toBe(500);
    const payload: unknown = await unconfigured.json();
    expect(payload).toEqual({
      success: false,
      data: null,
      error: { code: "config", message: "Gemini の設定がありません" },
    });
    expect(JSON.stringify(payload)).not.toContain("test-gemini-key");
  });
});

function questionBody(content: string): string {
  return JSON.stringify({ messages: [{ role: "user", content }] });
}

async function sign(): Promise<string> {
  return new SignJWT({ email: OWNER_EMAIL })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(TEAM_DOMAIN)
    .setAudience(AUDIENCE)
    .setExpirationTime("2h")
    .sign(privateKey);
}

async function call(input: {
  token: string | null;
  origin: string | null;
  body: string;
  geminiKey?: string;
}): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (input.token !== null) {
    headers.set("cf-access-jwt-assertion", input.token);
  }
  if (input.origin !== null) {
    headers.set("origin", input.origin);
  }
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new IncomingRequest("https://stack.example.com/api/chat", {
      method: "POST",
      headers,
      body: input.body,
    }),
    input.geminiKey === undefined ? env : { ...env, GEMINI_API_KEY: input.geminiKey },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function insertImport(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO imports (
       id, raw_text, raw_hash, status, created_at, updated_at
     ) VALUES (?, '本文', ?, 'done', ?, ?)`,
  )
    .bind(id, id, NOW, NOW)
    .run();
  return id;
}

async function insertSubcategory(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO subcategories (
       id, category_id, name, sort_order, created_by, reviewed, created_at
     ) VALUES (?, 'database', ?, 1, 'user', 1, ?)`,
  )
    .bind(id, `索引 ${id}`, NOW)
    .run();
  return id;
}

async function insertTech(subcategoryId: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO techs (
       id, name, name_key, subcategory_id, status, status_by, reason, reason_by, created_at, updated_at
     ) VALUES (?, 'PelagoDB', ?, ?, 'unrated', 'model', ?, 'model', ?, ?)`,
  )
    .bind(id, `pelagodb-${id}`, subcategoryId, "索引に使う", NOW, NOW)
    .run();
  return id;
}

async function insertMemo(importId: string, techId: string, title: string, body: string): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO memos (id, import_id, title, body, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, importId, title, body, NOW)
    .run();
  await env.DB.prepare(
    "INSERT INTO memo_techs (memo_id, tech_id, relation) VALUES (?, ?, 'subject')",
  )
    .bind(id, techId)
    .run();
}
