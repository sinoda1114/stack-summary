import type { InquiryContext } from "../db/inquiry-context";
import {
  geminiResponseSchema,
  generateValidated,
  type StructuredGenerator,
} from "./model-output";
import {
  inquireSchema,
  inquireSystemPrompt,
  type InquireOutput,
} from "./prompts/inquire.v1";

export const EMPTY_INQUIRY_ANSWER = "取り込んだメモと技術がまだありません";

export async function inquireStack(
  generator: StructuredGenerator,
  input: {
    model: string;
    question: string;
    context: InquiryContext;
  },
): Promise<InquireOutput> {
  if (input.context.memos.length === 0 && input.context.techs.length === 0) {
    return { answer: EMPTY_INQUIRY_ANSWER };
  }
  return generateValidated(
    generator,
    {
      model: input.model,
      system: inquireSystemPrompt,
      contents: JSON.stringify({
        question: input.question,
        ...input.context,
      }),
      responseJsonSchema: geminiResponseSchema(inquireSchema),
    },
    inquireSchema,
  );
}
