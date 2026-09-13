// Read-only public smoke checks. Does not create users or finance records.
import assert from "node:assert/strict";
const [web, api] = process.argv.slice(2);
for (const value of [web, api]) {
  assert.ok(value && URL.canParse(value) && new URL(value).protocol === "https:" && new URL(value).origin === value,
    "Usage: npm run check:deployment -- https://WEB_HOST https://API_HOST (no trailing slash)");
}
async function request(url, init = {}) { return fetch(url, { ...init, signal: AbortSignal.timeout(90000) }); }
const health = await request(`${api}/health`);
assert.equal(health.status, 200); assert.equal((await health.json()).status, "ok");
assert.equal(health.headers.get("x-content-type-options"), "nosniff");
assert.ok(health.headers.get("strict-transport-security"));
for (const path of ["/transactions", "/me", "/exports/expenses.xlsx", "/analytics/monthly"]) {
  assert.equal((await request(`${api}${path}`)).status, 401, `${path} must require authentication`);
}
const preflight = await request(`${api}/transactions`, { method: "OPTIONS", headers: { Origin: web, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), web);
assert.equal((await request(`${api}/health`, { headers: { Origin: "https://untrusted.invalid" } })).status, 403);
const login = await request(`${web}/login`);
assert.equal(login.status, 200); assert.equal(login.headers.get("x-frame-options"), "DENY");
assert.equal(login.headers.get("x-content-type-options"), "nosniff");
assert.ok((await login.text()).includes("Sign in"));
console.log("Public health, login page, API authentication, CORS and security headers passed. Complete the two-account checklist in Docs/STAGE_5.md before tagging the beta.");
