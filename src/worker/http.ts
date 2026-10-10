export type ApiErrorBody = {
  code: string;
  message: string;
};

export type ApiBody<T> = {
  success: boolean;
  data: T | null;
  error: ApiErrorBody | null;
};

export function ok<T>(data: T): ApiBody<T> {
  return { success: true, data, error: null };
}

export function fail(code: string, message: string): ApiBody<null> {
  return { success: false, data: null, error: { code, message } };
}

export const FORBIDDEN_MESSAGE = "認証に失敗しました";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
