import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("production migration command rejects unsafe targets before starting migrations", () => {
  const baseline = { ...process.env, NODE_ENV: "production", AUTH_MODE: "supabase", WEB_ORIGIN: "https://app.example.test", SUPABASE_URL: "https://testproject.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", SUPABASE_DATA_API_DISABLED: "true", DATABASE_URL: "postgresql://postgres.testproject:secret-not-logged@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require" };
  for (const [override, args] of [
    [{ DATABASE_URL: "postgresql://test:secret-not-logged@localhost:5432/local" }, ["--confirm-project=testproject"]],
    [{ DATABASE_URL: baseline.DATABASE_URL.replace(":5432/", ":6543/") }, ["--confirm-project=testproject"]],
    [{ DATABASE_URL: baseline.DATABASE_URL.replace("?sslmode=require", "") }, ["--confirm-project=testproject"]],
    [{}, ["--confirm-project=otherproject"]],
    [{ SUPABASE_DATA_API_DISABLED: "false" }, ["--confirm-project=testproject"]],
  ] as const) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-production.ts", ...args], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), env: { ...baseline, ...override }, encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Production preparation failed/);
    assert.doesNotMatch(result.stdout + result.stderr, /secret-not-logged|Applying reviewed/);
  }
});
