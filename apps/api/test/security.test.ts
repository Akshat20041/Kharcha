import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { RateLimit } from "../src/rate-limit.js";

const production = { DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused", NODE_ENV: "production", LOG_LEVEL: "silent", AUTH_MODE: "supabase", SUPABASE_URL: "https://auth.example.test", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", WEB_ORIGIN: "https://app.example.test" };
const a = "00000000-0000-4000-8000-000000000002";
const b = "00000000-0000-4000-8000-000000000003";

test("production fails closed on local auth, insecure origins and private keys", () => {
  assert.doesNotThrow(() => readConfig(production));
  for (const override of [{ AUTH_MODE: "local" }, { WEB_ORIGIN: "*" }, { WEB_ORIGIN: "http://localhost:3000" }, { SUPABASE_URL: "http://localhost:3312" }, { SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" }, { SUPABASE_PUBLISHABLE_KEY: `eyJ.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature` }]) {
    assert.throws(() => readConfig({ ...production, ...override }), /Invalid environment configuration/);
  }
});

test("rate windows expire, isolate identities and fail closed at capacity", () => {
  let now = 0; const limiter = new RateLimit(() => now, 2);
  assert.equal(limiter.take("a", 1), 0); assert.equal(limiter.take("a", 1), 60);
  assert.equal(limiter.take("b", 1), 0); assert.equal(limiter.take("c", 1), 60);
  now = 60000; assert.equal(limiter.take("c", 1), 0); assert.equal(limiter.take("a", 1), 0);
});

test("HTTP hardening bounds bodies, protects JSON and keeps logs private", async (t) => {
  const logs: string[] = [];
  const app = buildApp(readConfig({ ...production, LOG_LEVEL: "info" }), { resolveIdentity: async () => a, logStream: { write: (line) => { logs.push(line); } } });
  t.after(() => app.close());
  app.post("/security-probe", async () => { throw new Error("private-finance-payload"); });
  const response = await app.inject({ method: "POST", url: "/security-probe?password=private-finance-payload", headers: { authorization: "Bearer private-finance-payload", "x-request-id": "private-finance-payload" }, payload: { description: "private-finance-payload" } });
  assert.equal(response.statusCode, 500); assert.equal(response.json().error, "Internal server error");
  assert.equal(response.headers["x-content-type-options"], "nosniff"); assert.equal(response.headers["x-frame-options"], "DENY");
  assert.ok(response.headers["strict-transport-security"]); assert.notEqual(response.headers["x-request-id"], "private-finance-payload");
  for (const payload of ['{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{"polluted":true}}}', '{bad']) {
    assert.equal((await app.inject({ method: "POST", url: "/security-probe", headers: { "content-type": "application/json" }, payload })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: "POST", url: "/security-probe", payload: { text: "x".repeat(33000) } })).statusCode, 413);
  assert.equal((await app.inject({ url: "/health", headers: { origin: "https://evil.example" } })).statusCode, 403);
  assert.doesNotMatch(logs.join(""), /private-finance-payload|postgresql:\/\//);
  const completed = logs.map((line) => JSON.parse(line)).find((line) => line.msg === "Request completed");
  assert.equal(completed.route, "/security-probe"); assert.equal(completed.userId, a);
  assert.equal(typeof completed.latencyMs, "number"); assert.ok(completed.reqId);
});

test("AI/export/profile budgets isolate users and IP throttle precedes auth", async (t) => {
  let identity = a; let resolutions = 0;
  const app = buildApp(readConfig(production), { resolveIdentity: async () => { resolutions++; return identity; } });
  t.after(() => app.close());
  // Invalid payloads/IDs stop before database or provider work, but still consume budget.
  for (let i = 0; i < 10; i++) assert.equal((await app.inject({ method: "POST", url: "/expense-parser/parse", payload: {} })).statusCode, 400);
  const denied = await app.inject({ method: "POST", url: "/expense-parser/parse", payload: {} });
  assert.equal(denied.statusCode, 429); assert.ok(Number(denied.headers["retry-after"]) > 0);
  identity = b;
  assert.equal((await app.inject({ method: "POST", url: "/expense-parser/parse", payload: {} })).statusCode, 400);
  for (let i = 0; i < 5; i++) assert.equal((await app.inject("/exports/expenses.xlsx?scope=invalid")).statusCode, 400);
  assert.equal((await app.inject("/exports/expenses.xlsx?scope=invalid")).statusCode, 429);
  for (let i = 0; i < 30; i++) assert.equal((await app.inject({ method: "PATCH", url: "/me", payload: { currency: "USD" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PATCH", url: "/me", payload: {} })).statusCode, 429);
  for (let i = 0; i < 60; i++) assert.equal((await app.inject("/analytics/range?start_date=invalid")).statusCode, 400);
  assert.equal((await app.inject("/dashboard?month=invalid")).statusCode, 429);
  for (let i = 0; i < 20; i++) assert.equal((await app.inject({ method: "POST", url: "/recurring-expenses/invalid/generate", payload: {} })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/recurring-expenses/invalid/generate", payload: {} })).statusCode, 429);
  while (resolutions < 300) await app.inject("/unknown");
  assert.equal((await app.inject({ url: "/unknown", headers: { "x-forwarded-for": "1.2.3.4" } })).statusCode, 429);
  assert.equal(resolutions, 300); assert.equal((await app.inject("/health")).statusCode, 200);
});

test("anonymous requests are throttled without ever reaching a provider", async (t) => {
  let verified = 0; let providerCalls = 0;
  const app = buildApp(readConfig(production), { resolveIdentity: async () => { verified++; return null; }, expenseProvider: { extract: async () => { providerCalls++; throw new Error("Must not run"); } } });
  t.after(() => app.close());
  for (let i = 0; i < 300; i++) {
    const reply = await app.inject({ method: "POST", url: "/expense-parser/parse", payload: { text: "50 coffee" } });
    assert.equal(reply.statusCode, 401);
    assert.equal(reply.headers["x-content-type-options"], "nosniff");
  }
  assert.equal((await app.inject({ method: "POST", url: "/expense-parser/parse", payload: {} })).statusCode, 429);
  assert.equal(verified, 300); assert.equal(providerCalls, 0);
});
