import {
  geminiResponseSchema,
  generateValidated,
  type StructuredGenerator,
} from "./model-output";
import {
  inquireContents,
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
    context: {
      memos: readonly { title: string; body: string; memoDate: string | null }[];
      techs: readonly { name: string; status: string; reason: string | null }[];
      memoTruncated: boolean;
      techTruncated: boolean;
    };
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
      contents: inquireContents({
        question: input.question,
        memos: input.context.memos,
        techs: input.context.techs,
        memoTruncated: input.context.memoTruncated,
        techTruncated: input.context.techTruncated,
      }),
      responseJsonSchema: geminiResponseSchema(inquireSchema),
    },
    inquireSchema,
  );
}
