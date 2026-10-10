import {
  geminiResponseSchema,
  generateValidated,
  type StructuredGenerator,
} from "./model-output";
import {
  relateCandidatesContents,
  relateCandidatesSchema,
  relateCandidatesSystemPrompt,
  type RelateCandidatesOutput,
} from "./prompts/relate-candidates.v1";

export async function extractRelationCandidates(
  generator: StructuredGenerator,
  input: {
    model: string;
    context: string;
    techs: readonly { name: string }[];
  },
): Promise<RelateCandidatesOutput> {
  return generateValidated(
    generator,
    {
      model: input.model,
      system: relateCandidatesSystemPrompt,
      contents: relateCandidatesContents({
        context: input.context,
        techs: input.techs,
      }),
      responseJsonSchema: geminiResponseSchema(relateCandidatesSchema),
    },
    relateCandidatesSchema,
  );
}
