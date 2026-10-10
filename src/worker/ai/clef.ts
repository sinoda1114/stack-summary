import { z } from "zod";
import { InvalidModelOutput } from "./model-output";

export const CLEF_MODEL = "@cf/cloudflare/clef-flash";

export const CLEF_CHOICE_ID = /^[A-Za-z0-9_.-]{1,100}$/;

export type ClefQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type ClefDecideInput = {
  state: unknown;
  questions: Record<string, ClefQuestion>;
};

export type ClefChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type ClefDecider = {
  decide(
    input: ClefDecideInput,
  ): Promise<{ answers: Record<string, ClefChoiceAnswer> }>;
};

export type ClefBinding = {
  run(model: typeof CLEF_MODEL, input: Record<string, unknown>): Promise<unknown>;
};

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});

const clefResponseSchema = z.object({
  answers: z.record(z.string(), choiceAnswerSchema),
});

export function isClefChoiceId(id: string): boolean {
  return CLEF_CHOICE_ID.test(id);
}

export function clefBinding(ai: Ai): ClefBinding {
  return {
    async run(model, input) {
      return ai.run(model, input);
    },
  };
}

export function clefDecider(binding: ClefBinding): ClefDecider {
  return {
    async decide(input) {
      const payload: Record<string, unknown> = {
        model: "clef-flash",
        state: input.state,
        questions: input.questions,
      };
      const raw = await binding.run(CLEF_MODEL, payload);
      return { answers: parseClefChoices(raw) };
    },
  };
}

export function parseClefChoices(
  raw: unknown,
): Record<string, ClefChoiceAnswer> {
  const parsed = clefResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidModelOutput("Clef の出力が不正です");
  }
  return parsed.data.answers;
}
