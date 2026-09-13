import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/auth.spec.ts",
  globalSetup: "./e2e/auth-setup.ts",
  webServer: {
    command: "node ../../node_modules/next/dist/bin/next dev --hostname localhost --port 3310",
    url: "http://localhost:3310", reuseExistingServer: false, timeout: 120000,
    env: { NEXT_PUBLIC_API_URL: "http://localhost:3311", NEXT_PUBLIC_AUTH_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3312", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key", KHARCHA_E2E: "1" },
  },
});
