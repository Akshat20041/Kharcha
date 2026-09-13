import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../src/app.js";
import { readConfig } from "../../src/config.js";
import { createDatabase } from "../../src/database.js";
import { seedCategories } from "../../prisma/categories.js";
import { LOCAL_USER_ID } from "../../src/identity.js";
import { transferLocalData } from "../../src/transfer-local-data.js";
import { startTestDatabase } from "./database.js";
import { startAuthFixture } from "../fixtures/supabase.js";

test("Supabase-verified sessions protect all finance routes and profile ownership", { timeout: 120000 }, async (t) => {
  const cluster = await startTestDatabase(); const db = createDatabase(cluster.url); const auth = await startAuthFixture();
  const app = buildApp(readConfig({ DATABASE_URL: cluster.url, LOG_LEVEL: "silent", NODE_ENV: "test", AUTH_MODE: "supabase", SUPABASE_URL: auth.url, SUPABASE_PUBLISHABLE_KEY: "test-public-key", APP_TIMEZONE: "Asia/Kolkata" }));
  t.after(async () => { await app.close(); await auth.app.close(); await db.$disconnect(); await cluster.stop(); });
  await seedCategories(db); const category = await db.category.findFirstOrThrow();
  const a = auth.token(auth.a.id), b = auth.token(auth.b.id);
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  await t.test("missing, forged, expired, wrong-project and revoked tokens cannot reach protected routes", async () => {
    const revoked = auth.token(auth.a.id, { nonce: "revoked" }); auth.revoke(revoked);
    for (const token of ["", "forged", `${a.slice(0, -8)}invalid`, auth.token(auth.a.id, { exp: 1 }), auth.token(auth.a.id, { iss: "https://other.example/auth/v1" }), auth.token(auth.a.id, { aud: "other" }), revoked]) {
      for (const url of ["/transactions", "/recurring-expenses", "/dashboard", "/analytics/monthly", "/analytics/range", "/exports/expenses.xlsx", "/categories", "/me"]) {
        assert.equal((await app.inject({ url, headers: { ...headers(token), "x-user-id": auth.a.id } })).statusCode, 401, url);
      }
      assert.equal((await app.inject({ method: "POST", url: "/expense-parser/parse", headers: headers(token), payload: { text: "50 coffee" } })).statusCode, 401);
    }
    assert.equal(await db.user.count(), 1); // Only the legacy user; rejected tokens never provision.
    assert.equal((await app.inject("/health")).statusCode, 200);
    const preflight = await app.inject({ method: "OPTIONS", url: "/transactions", headers: { origin: "http://localhost:3000", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    assert.equal(preflight.statusCode, 204);
    assert.match(String(preflight.headers["access-control-allow-headers"]), /authorization/i);
  });
  await t.test("verified UUID provisions an independent account and scopes profiles and transactions", async () => {
    for (const [token, user] of [[a, auth.a], [b, auth.b]] as const) {
      const profile = await app.inject({ url: "/me", headers: headers(token) });
      assert.equal(profile.statusCode, 200, profile.body); assert.equal(profile.json().id, user.id);
      const response = await app.inject({ method: "POST", url: "/transactions", headers: headers(token), payload: { total_amount: "100", description: user.email, category_id: category.id } });
      assert.equal(response.statusCode, 201); assert.equal(response.json().user_id, user.id);
    }
    const rows = await db.transaction.findMany({ where: { user_id: auth.b.id } });
    assert.equal((await app.inject({ url: `/transactions/${rows[0]!.id}`, headers: headers(a) })).statusCode, 404);
    const profile = await app.inject({ method: "PATCH", url: "/me", headers: headers(a), payload: { display_name: "My account", time_zone: "America/Los_Angeles", currency: "INR" } });
    assert.equal(profile.statusCode, 200); assert.equal(profile.json().display_name, "My account");
    assert.equal((await app.inject({ url: "/me", headers: headers(b) })).json().display_name, "");
    assert.equal((await app.inject({ url: "/analytics/monthly", headers: headers(a) })).json().time_zone, "America/Los_Angeles");
    for (const payload of [{ display_name: "No", time_zone: "UTC", currency: "USD" }, { display_name: "No", time_zone: "invalid", currency: "INR" }, { display_name: "No", time_zone: "UTC", currency: "INR", user_id: auth.b.id }]) {
      assert.equal((await app.inject({ method: "PATCH", url: "/me", headers: headers(a), payload })).statusCode, 400);
    }
    assert.ok(auth.metrics.verified > 0);
  });
  await t.test("legacy transfer is explicit, atomic, preserves history and cannot claim another account", async () => {
    const local = buildApp(readConfig({ DATABASE_URL: cluster.url, LOG_LEVEL: "silent" }), { clock: () => new Date("2026-09-12T12:00:00Z") });
    try {
      const rule = await local.inject({ method: "POST", url: "/recurring-expenses", payload: { name: "Existing rent", total_amount: "1000", category_id: category.id, frequency: "monthly", start_date: "2026-09-01" } });
      assert.equal(rule.statusCode, 201);
      assert.equal((await local.inject({ method: "POST", url: `/recurring-expenses/${rule.json().id}/generate`, payload: {} })).statusCode, 200);
      await db.groqApiUsage.create({ data: { user_id: LOCAL_USER_ID, model: "test", outcome: "test", duration_ms: 1 } });
      const before = await db.transaction.findFirstOrThrow({ where: { user_id: LOCAL_USER_ID } });
      assert.equal((await transferLocalData(db, auth.a.id)).applied, false);
      assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: before.id } })).user_id, LOCAL_USER_ID);
      await assert.rejects(transferLocalData(db, randomUUID(), true));
      const result = await transferLocalData(db, auth.a.id, true); assert.equal(result.transactions, 1);
      const after = await db.transaction.findUniqueOrThrow({ where: { id: before.id } });
      assert.deepEqual({ ...after, user_id: LOCAL_USER_ID }, before);
      assert.equal((await db.recurringExpense.findUniqueOrThrow({ where: { id: rule.json().id } })).user_id, auth.a.id);
      assert.equal((await transferLocalData(db, auth.b.id, true)).transactions, 0);
      assert.equal((await app.inject({ url: `/transactions/${before.id}`, headers: headers(b) })).statusCode, 404);
      assert.equal((await app.inject({ url: `/transactions/${before.id}`, headers: headers(a) })).statusCode, 200);
    } finally { await local.close(); }
  });
});

