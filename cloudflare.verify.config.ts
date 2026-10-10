import { bindings, defineConfig, exports } from "cf/config";

// 公開しない検証 Worker。ルートは付けず、workers.dev はオフ。
export default defineConfig({
  worker: {
    name: "stack-summary-verify",
    compatibilityDate: "2026-10-10",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "src/worker/verify-index.ts",
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 1,
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api", "/api/*"],
    },
    env: {
      ACCESS_TEAM_DOMAIN: bindings.text(""),
      ACCESS_AUD: bindings.text(""),
      APP_ORIGIN: bindings.text(""),
      GEMINI_MODEL: bindings.text("gemini-flash-lite-latest"),
      GEMINI_MODEL_LIGHT: bindings.text("gemini-flash-lite-latest"),
      GEMINI_MODEL_HEAVY: bindings.text("gemini-flash-latest"),
      IMPORT_MAX_CHARS: bindings.text("50000"),
      PREVIEW_OPEN: bindings.text("1"),
      DB: bindings.d1({
        id: "069b92a9-4af2-4d1c-8930-e079583b939c",
      }),
      IMPORT_WORKFLOW: bindings.workflow({
        name: "stack-summary-verify-import",
        worker: "stack-summary-verify",
        exportName: "ImportWorkflow",
      }),
      ASSETS: bindings.assets(),
      AI: bindings.ai(),
    },
    exports: {
      ImportWorkflow: exports.workflow({
        name: "stack-summary-verify-import",
      }),
      VerifyDiscordWorkflow: exports.workflow({
        name: "stack-summary-verify-discord",
      }),
    },
  },
});
