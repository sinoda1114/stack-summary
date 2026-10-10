import {
  acceptClassification,
  type AcceptedClassification,
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

export { CLASSIFY_PROMPT_VERSION };

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

export async function classifyTech(
  classifier: Classifier,
  input: ClassifierInput,
): Promise<AcceptedClassification> {
  const proposal = await classifier.classify(input);
  return acceptClassification(proposal, input);
}
