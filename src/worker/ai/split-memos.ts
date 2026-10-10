import { generateValidated, type StructuredGenerator } from "./model-output";
import {
  SPLIT_PROMPT_VERSION,
  splitMemoSchema,
  splitSystemPrompt,
  type SplitMemoOutput,
} from "./prompts/split.v1";

export { SPLIT_PROMPT_VERSION };

export async function splitMemos(
  generator: StructuredGenerator,
  input: { model: string; text: string },
): Promise<SplitMemoOutput> {
  return generateValidated(
    generator,
    {
      model: input.model,
      system: splitSystemPrompt,
      contents: input.text,
      responseJsonSchema: splitMemoSchema.toJSONSchema(),
    },
    splitMemoSchema,
  );
}
