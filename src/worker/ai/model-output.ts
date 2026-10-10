import type { ZodType } from "zod";

const MEMO_DATE_PATTERN = String.raw`^\d{4}-\d{2}-\d{2}$`;

export function geminiResponseSchema(schema: ZodType): unknown {
  return adaptGeminiSchema(schema.toJSONSchema());
}

function adaptGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => adaptGeminiSchema(item));
  }
  if (typeof node !== "object" || node === null) {
    return node;
  }
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    record[key] = adaptGeminiSchema(value);
  }
  if (typeof record.const === "string") {
    record.enum = [record.const];
    delete record.const;
  }
  if (record.pattern === MEMO_DATE_PATTERN) {
    delete record.pattern;
    record.format = "date";
  }
  return record;
}

export class InvalidModelOutput extends Error {
  constructor(message = "モデルの出力が不正です") {
    super(message);
    this.name = "InvalidModelOutput";
  }
}

export type StructuredGenerateRequest = {
  model: string;
  system: string;
  contents: string;
  responseJsonSchema: unknown;
};

export type StructuredGenerator = {
  generate(request: StructuredGenerateRequest): Promise<string>;
};

export async function generateValidated<T>(
  generator: StructuredGenerator,
  request: StructuredGenerateRequest,
  schema: ZodType<T>,
): Promise<T> {
  let last = new InvalidModelOutput();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text: string;
    try {
      text = await generator.generate(request);
    } catch (error) {
      if (!(error instanceof InvalidModelOutput)) {
        throw error;
      }
      last = error;
      continue;
    }
    const value = parseModelJson(text, schema);
    if (value !== null) {
      return value;
    }
    last = new InvalidModelOutput();
  }
  throw last;
}

function parseModelJson<T>(text: string, schema: ZodType<T>): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  return result.data;
}
