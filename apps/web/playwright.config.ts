import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/auth.spec.ts",
  globalSetup: "./e2e/setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  use: { baseURL: "http://localhost:3310", browserName: "chromium", timezoneId: "Asia/Kolkata", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "node ../../node_modules/next/dist/bin/next dev --hostname localhost --port 3310",
    url: "http://localhost:3310",
    env: { NEXT_PUBLIC_API_URL: "http://localhost:3311", NEXT_PUBLIC_AUTH_MODE: "local", KHARCHA_E2E: "1" },
    reuseExistingServer: false,
    timeout: 120000,
  },
});
