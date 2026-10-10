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
  return readJson<ImportItem[]>(await fetch("/api/imports"));
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
  const response = await fetch("/api/imports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await readJson<ImportItem>(response);
  return { ...result, httpStatus: response.status };
}

async function readJson<T>(response: Response): Promise<ApiResult<T>> {
  return (await response.json()) as ApiResult<T>;
}
