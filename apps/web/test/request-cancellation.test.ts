import assert from "node:assert/strict";
import test from "node:test";
import { request, ApiError } from "../src/lib/api";

test("requests time out even if fetch stalls, cancellation is distinct, and writes are never retried", async (t) => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
  t.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = previous; });
  const fetch = t.mock.method(globalThis, "fetch", () => new Promise<Response>(() => {}));
  await assert.rejects(request("/me", "GET", undefined, { timeoutMs: 10 }), ApiError);
  const controller = new AbortController();
  const pending = request("/me", "GET", undefined, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  fetch.mock.mockImplementation(async () => new Response("{}", { status: 503 }));
  const before = fetch.mock.callCount();
  await assert.rejects(request("/transactions", "POST", {}), (error: unknown) => error instanceof ApiError && error.status === 503);
  assert.equal(fetch.mock.callCount() - before, 1);
});
