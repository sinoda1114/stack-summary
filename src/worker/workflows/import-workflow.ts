import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { geminiGeneratorFromApiKey } from "../ai/gemini";
import { readGeminiRuntime } from "../env";
import { executeImport, type ImportStepRunner } from "./import-run";

export type ImportWorkflowParams = {
  importId: string;
};

// 仮: Cloudflare Workflows。見込む上限は 1 日 3000 ステップ、呼び出しあたり CPU 10 ミリ秒。Queues は使わない。
export class ImportWorkflow extends WorkflowEntrypoint<Env, ImportWorkflowParams> {
  override async run(
    event: WorkflowEvent<ImportWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const runtime = readGeminiRuntime(this.env);
    if (runtime === null) {
      throw new Error("Gemini の設定がありません");
    }
    await executeImport(
      step as ImportStepRunner,
      {
        db: this.env.DB,
        generator: geminiGeneratorFromApiKey(runtime.apiKey),
        model: runtime.model,
        promptVersion: runtime.promptVersion,
        now: new Date().toISOString(),
      },
      event.payload.importId,
    );
  }
}
