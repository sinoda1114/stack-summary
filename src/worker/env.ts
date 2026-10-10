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
  modelLight: string;
  modelHeavy: string;
  importMaxChars: number;
};

export type ChatRuntime = {
  apiKey: string;
  model: string;
};

const CHAT_LIGHT_MODEL_DEFAULT = "gemini-flash-lite-latest";

export function readChatRuntime(env: {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_MODEL_LIGHT?: string;
}): ChatRuntime | null {
  const apiKey = env.GEMINI_API_KEY.trim();
  const model = chatModelName(env);
  if (apiKey.length === 0 || model === null) {
    return null;
  }
  return { apiKey, model };
}

function chatModelName(env: {
  GEMINI_MODEL: string;
  GEMINI_MODEL_LIGHT?: string;
}): string | null {
  if (typeof env.GEMINI_MODEL_LIGHT === "string") {
    const light = env.GEMINI_MODEL_LIGHT.trim();
    return light.length > 0 ? light : CHAT_LIGHT_MODEL_DEFAULT;
  }
  const model = env.GEMINI_MODEL.trim();
  return model.length > 0 ? model : null;
}

export function readGeminiRuntime(env: {
  GEMINI_API_KEY: string;
  GEMINI_MODEL_LIGHT: string;
  GEMINI_MODEL_HEAVY: string;
  IMPORT_MAX_CHARS: string;
}): GeminiRuntime | null {
  const apiKey = env.GEMINI_API_KEY.trim();
  const modelLight = env.GEMINI_MODEL_LIGHT.trim();
  const modelHeavy = env.GEMINI_MODEL_HEAVY.trim();
  const maxCharsText = env.IMPORT_MAX_CHARS.trim();
  if (
    apiKey.length === 0 ||
    modelLight.length === 0 ||
    modelHeavy.length === 0 ||
    !/^[1-9][0-9]*$/.test(maxCharsText)
  ) {
    return null;
  }
  const importMaxChars = Number(maxCharsText);
  if (!Number.isSafeInteger(importMaxChars)) {
    return null;
  }
  return { apiKey, modelLight, modelHeavy, importMaxChars };
}
