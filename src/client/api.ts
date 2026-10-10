export type ApiResult<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
};

export type ImportItem = {
  id: string;
  status: "queued" | "processing" | "done" | "failed";
  memoCount: number;
  skippedCount: number;
  error: string | null;
  sourceLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listImports(): Promise<ApiResult<ImportItem[]>> {
  return requestJson<ImportItem[]>("/api/imports");
}

export async function createImport(
  text: string,
  sourceLabel: string,
): Promise<ApiResult<ImportItem> & { httpStatus: number }> {
  const body: { text: string; sourceLabel?: string } = { text };
  const trimmed = sourceLabel.trim();
  if (trimmed.length > 0) {
    body.sourceLabel = trimmed;
  }
  let response: Response;
  try {
    response = await fetch("/api/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ...failed("network", "通信に失敗しました"), httpStatus: 0 };
  }
  try {
    const result = await parseApiResult<ImportItem>(response);
    return { ...result, httpStatus: response.status };
  } catch {
    return { ...failed("invalid", "応答を読めませんでした"), httpStatus: response.status };
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return failed("network", "通信に失敗しました");
  }
  try {
    if (init?.signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    return await parseApiResult<T>(response);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return failed("invalid", "応答を読めませんでした");
  }
}

async function parseApiResult<T>(response: Response): Promise<ApiResult<T>> {
  const body: unknown = await response.json();
  if (!isEnvelope(body)) {
    return failed("invalid", "応答を読めませんでした");
  }
  if (!body.success || body.data === null || body.data === undefined) {
    const error = isApiError(body.error) ? body.error : { code: "failed", message: "取得に失敗しました" };
    return { success: false, data: null, error };
  }
  return { success: true, data: body.data as T, error: null };
}

export async function requestBlob(input: RequestInfo | URL): Promise<ApiResult<Blob>> {
  let response: Response;
  try {
    response = await fetch(input);
  } catch {
    return failed("network", "通信に失敗しました");
  }
  if (!response.ok) {
    try {
      return await parseApiResult<Blob>(response);
    } catch {
      return failed("failed", "書き出しに失敗しました");
    }
  }
  try {
    return { success: true, data: await response.blob(), error: null };
  } catch {
    return failed("failed", "書き出しに失敗しました");
  }
}

function failed(code: string, message: string): ApiResult<never> {
  return { success: false, data: null, error: { code, message } };
}

function isEnvelope(body: unknown): body is { success: boolean; data: unknown; error?: unknown } {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    typeof body.success === "boolean" &&
    "data" in body
  );
}

function isApiError(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}
