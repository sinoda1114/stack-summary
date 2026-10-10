import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
  worker: {
    name: "stack-summary",
    compatibilityDate: "2026-10-10",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "src/worker/index.ts",
    workersDev: true,
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
      GEMINI_MODEL: bindings.text(""),
      IMPORT_MAX_CHARS: bindings.text("50000"),
      PREVIEW_OPEN: bindings.text("1"),
      DB: bindings.d1({
        id: "d56c3abf-aef6-4b76-893e-5403370ca180",
      }),
      IMPORT_WORKFLOW: bindings.workflow({
        name: "stack-summary-import",
        worker: "stack-summary",
        exportName: "ImportWorkflow",
      }),
      ASSETS: bindings.assets(),
    },
    exports: {
      ImportWorkflow: exports.workflow({
        name: "stack-summary-import",
      }),
    },
  },
});
