import type { ZodType } from "zod";

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
