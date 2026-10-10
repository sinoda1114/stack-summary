export type ImportTextProblem = "empty" | "too_long";

export function importTextProblem(
  text: string,
  maxChars: number,
): ImportTextProblem | null {
  if (text.trim().length === 0) {
    return "empty";
  }
  if (text.length > maxChars) {
    return "too_long";
  }
  return null;
}

export type GeminiRuntime = {
  apiKey: string;
  model: string;
  importMaxChars: number;
};

export function readGeminiRuntime(env: {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  IMPORT_MAX_CHARS: string;
}): GeminiRuntime | null {
  const apiKey = env.GEMINI_API_KEY.trim();
  const model = env.GEMINI_MODEL.trim();
  const maxCharsText = env.IMPORT_MAX_CHARS.trim();
  if (
    apiKey.length === 0 ||
    model.length === 0 ||
    !/^[1-9][0-9]*$/.test(maxCharsText)
  ) {
    return null;
  }
  const importMaxChars = Number(maxCharsText);
  if (!Number.isSafeInteger(importMaxChars)) {
    return null;
  }
  return { apiKey, model, importMaxChars };
}
