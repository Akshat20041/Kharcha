import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { buildApp } from "../src/app.js";
import { readConfig } from "../src/config.js";

test("slow requests and server failures are tracked without leaking URL or payload data", async (t) => {
  const logs: string[] = [];
  const app = buildApp(readConfig({ DATABASE_URL: "postgresql://test:test@localhost:1/unused", LOG_LEVEL: "info", SLOW_REQUEST_MS: "1" }), {
    logStream: { write: (line) => { logs.push(line); } },
  });
  t.after(() => app.close());
  app.get("/slow/:id", async () => { await setTimeout(10); return { ok: true }; });
  app.get("/failure", async (_request, reply) => reply.code(503).send({ error: "Unavailable" }));
  const slow = await app.inject("/slow/private-marker?secret=private-marker");
  const failure = await app.inject("/failure");
  const events = logs.map((line) => JSON.parse(line));
  const warning = events.find((event) => event.event === "slow_request");
  assert.equal(warning.route, "/slow/:id");
  assert.equal(warning.level, 40);
  assert.equal(warning.reqId, slow.headers["x-request-id"]);
  const error = events.find((event) => event.event === "request_error");
  assert.equal(error.statusCode, 503);
  assert.equal(error.level, 50);
  assert.equal(error.reqId, failure.headers["x-request-id"]);
  assert.doesNotMatch(logs.join(""), /private-marker|postgresql:/);
  for (const value of ["0", "-1", "NaN", "120001"]) assert.throws(() => readConfig({ DATABASE_URL: "postgresql://test:test@localhost:1/unused", SLOW_REQUEST_MS: value }));
});
