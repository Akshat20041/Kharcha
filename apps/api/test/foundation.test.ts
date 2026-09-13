import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

const environment = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/kharcha_test",
  LOG_LEVEL: "silent",
};

test("health responds without requiring a database connection", async (t) => {
  const app = buildApp(readConfig(environment));
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("CORS allows the configured frontend origin", async (t) => {
  const app = buildApp(readConfig({ ...environment, WEB_ORIGIN: "http://localhost:4000" }));
  t.after(() => app.close());
  const response = await app.inject({ url: "/health", headers: { origin: "http://localhost:4000" } });
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:4000");
  const other = await app.inject({ url: "/health", headers: { origin: "https://example.com" } });
  assert.notEqual(other.headers["access-control-allow-origin"], "https://example.com");
  for (const method of ["PATCH", "DELETE"]) {
    const preflight = await app.inject({ method: "OPTIONS", url: "/transactions/00000000-0000-4000-8000-000000000001",
      headers: { origin: "http://localhost:4000", "access-control-request-method": method,
        "access-control-request-headers": "content-type" } });
    assert.equal(preflight.statusCode, 204);
    assert.ok(String(preflight.headers["access-control-allow-methods"]).split(/,\s*/).includes(method));
    assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:4000");
  }
});

test("environment defaults and explicit port are supported", () => {
  assert.equal(readConfig(environment).PORT, 3001);
  assert.equal(readConfig({ ...environment, PORT: "4001" }).PORT, 4001);
});

test("invalid environment fails without leaking secrets", () => {
  for (const override of [
    { PORT: "0" }, { PORT: "65536" }, { PORT: "abc" },
    { WEB_ORIGIN: "https://example.com/path" },
    { NODE_ENV: "invalid" }, { DATABASE_URL: undefined },
    { DATABASE_URL: "mysql://user:private-secret@localhost/db" },
  ]) {
    assert.throws(() => readConfig({ ...environment, ...override }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Invalid environment configuration/);
      assert.doesNotMatch(error.message, /private-secret/);
      return true;
    });
  }
});
