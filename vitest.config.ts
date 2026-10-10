import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

process.env.OWNER_EMAIL ??= "owner@example.com";
process.env.GEMINI_API_KEY ??= "test-gemini-key";

const TEAM_DOMAIN = "https://team.cloudflareaccess.com";
const AUDIENCE = "test-aud";
const OWNER_EMAIL = "owner@example.com";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations("migrations");
      return {
        // Workers AI は手元の模擬が無い。テストは決定器を差し込むので、遠隔の束ねは開かない。
        remoteBindings: false,
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
            ACCESS_AUD: AUDIENCE,
            OWNER_EMAIL,
            APP_ORIGIN: "https://stack.example.com",
            GEMINI_API_KEY: "test-gemini-key",
            GEMINI_MODEL_LIGHT: "test-model-light",
            GEMINI_MODEL_HEAVY: "test-model-heavy",
            IMPORT_MAX_CHARS: "50000",
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    include: ["test/worker/**/*.ts"],
  },
});
