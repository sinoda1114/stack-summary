import { GoogleGenAI } from "@google/genai";
import {
  InvalidModelOutput,
  type StructuredGenerateRequest,
  type StructuredGenerator,
} from "./model-output";

type GenerateContent = (params: {
  model: string;
  contents: string;
  config: {
    systemInstruction: string;
    responseMimeType: "application/json";
    responseJsonSchema: unknown;
  };
}) => Promise<{ text?: string }>;

export function geminiGenerator(
  generateContent: GenerateContent,
): StructuredGenerator {
  return {
    async generate(request: StructuredGenerateRequest): Promise<string> {
      const response = await generateContent({
        model: request.model,
        contents: request.contents,
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: request.responseJsonSchema,
        },
      });
      if (response.text === undefined || response.text.length === 0) {
        throw new InvalidModelOutput("モデルの出力が空です");
      }
      return response.text;
    },
  };
}

export function geminiGeneratorFromApiKey(apiKey: string): StructuredGenerator {
  const ai = new GoogleGenAI({ apiKey });
  return geminiGenerator((params) => ai.models.generateContent(params));
}
