import { z } from "zod";
import type { EvalSample } from "./score-classification";

const labelSchema = z.object({
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
});

export const evalFileSchema = z.object({
  samples: z.array(
    z.object({
      name: z.string(),
      context: z.string(),
      expected: z.object({
        categoryId: z.string(),
        subcategoryId: z.string().nullable(),
      }),
      predicted: labelSchema.optional(),
    }),
  ),
});

export type EvalParseResult =
  | { ok: true; samples: EvalSample[] }
  | { ok: false; message: string };

export function parseEvalSamples(value: unknown): EvalParseResult {
  const parsed = evalFileSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: "サンプルの形が不正です" };
  }
  return { ok: true, samples: parsed.data.samples };
}
