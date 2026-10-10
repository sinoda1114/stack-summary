import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

process.env.OWNER_EMAIL ??= "owner@example.com";

const TEAM_DOMAIN = "https://team.cloudflareaccess.com";
const AUDIENCE = "test-aud";
const OWNER_EMAIL = "owner@example.com";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
          ACCESS_AUD: AUDIENCE,
          OWNER_EMAIL,
          APP_ORIGIN: "https://stack.example.com",
        },
      },
    }),
  ],
});
