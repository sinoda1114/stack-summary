export type ApiError = {
  code: string;
  message: string;
};

export type ApiResult<T> =
  | { success: true; data: T; error: null; httpStatus: number }
  | { success: false; data: null; error: ApiError; httpStatus: number };

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
): Promise<ApiResult<ImportItem>> {
  const body: { text: string; sourceLabel?: string } = { text };
  const trimmed = sourceLabel.trim();
  if (trimmed.length > 0) {
    body.sourceLabel = trimmed;
  }
  return requestJson<ImportItem>("/api/imports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  return request(input, init, parseApiResult<T>);
}

export function requestBlob(input: RequestInfo | URL): Promise<ApiResult<Blob>> {
  return request(input, undefined, async (response) => {
    if (!response.ok) {
      try {
        return await parseApiResult<Blob>(response);
      } catch {
        return failed("failed", "書き出しに失敗しました", response.status);
      }
    }
    try {
      return {
        success: true,
        data: await response.blob(),
        error: null,
        httpStatus: response.status,
      };
    } catch {
      return failed("failed", "書き出しに失敗しました", response.status);
    }
  });
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function request<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  read: (response: Response) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return failed("network", "通信に失敗しました", 0);
  }
  try {
    if (init?.signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    return await read(response);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return failed("invalid", "応答を読めませんでした", response.status);
  }
}

async function parseApiResult<T>(response: Response): Promise<ApiResult<T>> {
  const body: unknown = await response.json();
  if (!isEnvelope(body)) {
    return failed("invalid", "応答を読めませんでした", response.status);
  }
  if (!body.success || body.data === null || body.data === undefined) {
    return {
      success: false,
      data: null,
      error: isApiError(body.error) ? body.error : { code: "failed", message: "取得に失敗しました" },
      httpStatus: response.status,
    };
  }
  return {
    success: true,
    data: body.data as T,
    error: null,
    httpStatus: response.status,
  };
}

function failed(code: string, message: string, httpStatus: number): ApiResult<never> {
  return { success: false, data: null, error: { code, message }, httpStatus };
}

function isEnvelope(
  body: unknown,
): body is { success: boolean; data: unknown; error?: unknown } {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    typeof body.success === "boolean" &&
    "data" in body
  );
}

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}
