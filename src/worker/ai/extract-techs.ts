import {
  geminiResponseSchema,
  generateValidated,
  type StructuredGenerator,
} from "./model-output";
import {
  EXTRACT_PROMPT_VERSION,
  extractSystemPrompt,
  extractTechSchema,
  type ExtractTechOutput,
} from "./prompts/extract.v1";

export { EXTRACT_PROMPT_VERSION };

export async function extractTechs(
  generator: StructuredGenerator,
  input: { model: string; title: string; body: string },
): Promise<ExtractTechOutput> {
  return generateValidated(
    generator,
    {
      model: input.model,
      system: extractSystemPrompt,
      contents: JSON.stringify({ title: input.title, body: input.body }),
      responseJsonSchema: geminiResponseSchema(extractTechSchema),
    },
    extractTechSchema,
  );
}
