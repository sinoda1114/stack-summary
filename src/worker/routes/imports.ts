import type { Hono } from "hono";
import { importTextProblem, readGeminiRuntime } from "../env";
import { fail, ok } from "../http";
import { normalizeRawText, rawHash } from "../ingest/normalize";
import {
  findImportByHash,
  findImportById,
  insertQueuedImport,
  listImports,
  updateImport,
  type ImportRecord,
} from "../db/imports";

const LIST_LIMIT = 50;

export type ImportWorkflowClient = {
  create(options: {
    id?: string;
    params?: { importId: string };
  }): Promise<unknown>;
  get(id: string): Promise<unknown>;
};

export type ImportResponse = {
  id: string;
  status: ImportRecord["status"];
  memoCount: number;
  skippedCount: number;
  error: string | null;
  sourceLabel: string | null;
  createdAt: string;
  updatedAt: string;
  rawText?: string;
};

export function registerImportRoutes(app: Hono<{ Bindings: Env }>): void {
  app.post("/api/imports", async (c) => {
    const parsed = await readImportBody(c.req.raw);
    if (!parsed.ok) {
      return c.json(fail("invalid", parsed.message), 400);
    }
    const runtime = readGeminiRuntime(c.env);
    if (runtime === null) {
      return c.json(fail("config", "Gemini の設定がありません"), 500);
    }
    const result = await createImport({
      db: c.env.DB,
      workflow: c.env.IMPORT_WORKFLOW,
      maxChars: runtime.importMaxChars,
      text: parsed.text,
      sourceLabel: parsed.sourceLabel,
      now: new Date().toISOString(),
    });
    if (result.error !== null) {
      return c.json(fail(result.error.code, result.error.message), result.status);
    }
    return c.json(ok(result.data), result.status);
  });

  app.get("/api/imports", async (c) => {
    const rows = await listImports(c.env.DB, LIST_LIMIT);
    return c.json(ok(rows.map((row) => toImportResponse(row, false))));
  });

  app.get("/api/imports/:id", async (c) => {
    const row = await findImportById(c.env.DB, c.req.param("id"));
    if (row === null) {
      return c.json(fail("not_found", "取り込みが見つかりません"), 404);
    }
    return c.json(ok(toImportResponse(row, true)));
  });

  app.post("/api/imports/:id/reprocess", async (c) => {
    const result = await reprocessImport({
      db: c.env.DB,
      workflow: c.env.IMPORT_WORKFLOW,
      id: c.req.param("id"),
      now: new Date().toISOString(),
    });
    if (result.error !== null || result.data === null) {
      return c.json(
        fail(result.error?.code ?? "not_found", result.error?.message ?? "取り込みが見つかりません"),
        result.status,
      );
    }
    return c.json(ok(result.data), result.status);
  });
}

export async function createImport(input: {
  db: D1Database;
  workflow: ImportWorkflowClient;
  maxChars: number;
  text: string;
  sourceLabel: string | null;
  now: string;
}): Promise<{
  status: 200 | 202 | 400 | 500;
  data: ImportResponse | null;
  error: { code: string; message: string } | null;
}> {
  const problem = importTextProblem(input.text, input.maxChars);
  if (problem === "empty") {
    return {
      status: 400,
      data: null,
      error: { code: "empty", message: "本文が空です" },
    };
  }
  if (problem === "too_long") {
    return {
      status: 400,
      data: null,
      error: {
        code: "too_long",
        message: `${input.maxChars} 文字を超えています。分けて貼ってください`,
      },
    };
  }
  const hash = await rawHash(input.text);
  const existing = await findImportByHash(input.db, hash);
  if (existing !== null) {
    return { status: 200, data: toImportResponse(existing, false), error: null };
  }
  const id = crypto.randomUUID();
  const normalized = normalizeRawText(input.text);
  try {
    await insertQueuedImport(input.db, {
      id,
      rawText: normalized,
      rawHash: hash,
      sourceLabel: input.sourceLabel,
      now: input.now,
    });
  } catch (error) {
    if (!isUniqueConstraint(error)) {
      throw error;
    }
    const raced = await findImportByHash(input.db, hash);
    if (raced === null) {
      throw error;
    }
    return { status: 200, data: toImportResponse(raced, false), error: null };
  }
  try {
    await input.workflow.create({ id, params: { importId: id } });
  } catch {
    await updateImport(input.db, id, {
      status: "failed",
      error: "Workflow を起動できませんでした",
      now: input.now,
    });
    return {
      status: 500,
      data: null,
      error: { code: "workflow", message: "Workflow を起動できませんでした" },
    };
  }
  const created = await findImportById(input.db, id);
  if (created === null) {
    throw new Error("取り込みを読めませんでした");
  }
  return { status: 202, data: toImportResponse(created, false), error: null };
}

export async function reprocessImport(input: {
  db: D1Database;
  workflow: ImportWorkflowClient;
  id: string;
  now: string;
}): Promise<{
  status: 202 | 404 | 409;
  data: ImportResponse | null;
  error: { code: string; message: string } | null;
}> {
  const existing = await findImportById(input.db, input.id);
  if (existing === null) {
    return {
      status: 404,
      data: null,
      error: { code: "not_found", message: "取り込みが見つかりません" },
    };
  }
  if (existing.status === "queued" || existing.status === "processing") {
    return {
      status: 409,
      data: null,
      error: { code: "in_progress", message: "処理中です" },
    };
  }
  const instanceId = await nextWorkflowId(input.workflow, input.id);
  await input.workflow.create({
    id: instanceId,
    params: { importId: input.id },
  });
  await updateImport(input.db, input.id, {
    status: "queued",
    error: null,
    now: input.now,
  });
  const updated = await findImportById(input.db, input.id);
  if (updated === null) {
    throw new Error("取り込みを読めませんでした");
  }
  return { status: 202, data: toImportResponse(updated, false), error: null };
}

export async function nextWorkflowId(
  workflow: ImportWorkflowClient,
  importId: string,
): Promise<string> {
  if (!(await workflowExists(workflow, importId))) {
    return importId;
  }
  for (let count = 1; count <= 100; count += 1) {
    const candidate = `${importId}-${count}`;
    if (!(await workflowExists(workflow, candidate))) {
      return candidate;
    }
  }
  throw new Error("再処理の回数を決められませんでした");
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("unique");
}

async function workflowExists(
  workflow: ImportWorkflowClient,
  id: string,
): Promise<boolean> {
  try {
    await workflow.get(id);
    return true;
  } catch {
    return false;
  }
}

async function readImportBody(
  request: Request,
): Promise<
  | { ok: true; text: string; sourceLabel: string | null }
  | { ok: false; message: string }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, message: "JSON ではありません" };
  }
  if (typeof body !== "object" || body === null || !("text" in body)) {
    return { ok: false, message: "本文がありません" };
  }
  if (typeof body.text !== "string") {
    return { ok: false, message: "本文がありません" };
  }
  let sourceLabel: string | null = null;
  if ("sourceLabel" in body && body.sourceLabel !== undefined) {
    if (typeof body.sourceLabel !== "string") {
      return { ok: false, message: "出典の形が不正です" };
    }
    const trimmed = body.sourceLabel.trim();
    sourceLabel = trimmed.length === 0 ? null : trimmed;
  }
  return { ok: true, text: body.text, sourceLabel };
}

function toImportResponse(row: ImportRecord, includeText: boolean): ImportResponse {
  const response: ImportResponse = {
    id: row.id,
    status: row.status,
    memoCount: row.memoCount,
    skippedCount: row.skippedCount,
    error: row.error,
    sourceLabel: row.sourceLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (includeText) {
    response.rawText = row.rawText;
  }
  return response;
}
