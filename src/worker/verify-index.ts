import { app } from "./app";

export { ImportWorkflow } from "./workflows/import-workflow";
export { VerifyDiscordWorkflow } from "./verify-discord-workflow";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
