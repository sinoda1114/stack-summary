import {
  classifyTech,
  type Classifier,
  type ClassifierInput,
} from "./classifier";
import {
  geminiResponseSchema,
  generateValidated,
  type StructuredGenerator,
} from "./model-output";
import {
  CLASSIFY_PROMPT_VERSION,
  classifyContents,
  classifySchema,
  classifySystemPrompt,
} from "./prompts/classify.v1";

export { CLASSIFY_PROMPT_VERSION, classifyTech };

export function geminiClassifier(
  generator: StructuredGenerator,
  model: string,
): Classifier {
  return {
    version: CLASSIFY_PROMPT_VERSION,
    async classify(input: ClassifierInput) {
      return generateValidated(
        generator,
        {
          model,
          system: classifySystemPrompt,
          contents: classifyContents(input),
          responseJsonSchema: geminiResponseSchema(classifySchema),
        },
        classifySchema,
      );
    },
  };
}

