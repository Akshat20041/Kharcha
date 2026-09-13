import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../src/app.js";
import { readConfig } from "../../src/config.js";
import { createDatabase } from "../../src/database.js";
import { seedCategories } from "../../prisma/categories.js";
import { startTestDatabase } from "./database.js";

test("dashboard aggregates all persisted expenses and updates after mutations", { timeout: 120000 }, async (t) => {
  const cluster = await startTestDatabase();
  const db = createDatabase(cluster.url);
  const app = buildApp(readConfig({ DATABASE_URL: cluster.url, LOG_LEVEL: "silent", APP_TIMEZONE: "Asia/Kolkata" }), { db, clock: () => new Date("2026-09-08T20:00:00Z") });
  t.after(async () => { await app.close(); await db.$disconnect(); await cluster.stop(); });
  await seedCategories(db);
  const category = await db.category.findUniqueOrThrow({ where: { name: "Food & Dining" } });
  async function add(amount: string, date: string, split = false) {
    const response = await app.inject({ method: "POST", url: "/transactions", payload: {
      description: "Dinner", category_id: category.id, total_amount: amount, transaction_date: date,
      is_split: split, participant_count: split ? 2 : null,
    } });
    assert.equal(response.statusCode, 201); return response.json();
  }
  const summary = async (query = "month=2026-09") => {
    const response = await app.inject(`/dashboard?${query}`); assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers["cache-control"], "no-store"); return response.json();
  };
  const normal = await add("2000", "2026-09-01");
  await add("2000", "2026-09-08", true);
  await add("1234", "2026-08-31");
  // More than the history page size: the dashboard must include every row.
  for (let i = 0; i < 21; i++) await add("1", "2026-09-02");
  const rule = await app.inject({ method: "POST", url: "/recurring-expenses", payload: {
    name: "Rent", category_id: category.id, total_amount: "14000", frequency: "monthly", start_date: "2026-09-01",
  } });
  assert.equal((await summary()).recurring_spending, "0.00");
  await app.inject({ method: "POST", url: `/recurring-expenses/${rule.json().id}/generate`, payload: {} });
  let result = await summary();
  assert.equal(result.variable_spending, "3021.00");
  assert.equal(result.recurring_spending, "14000.00");
  assert.equal(result.effective_spending, "17021.00");
  assert.equal(result.total_paid, "18021.00");
  assert.equal(result.recoverable, "1000.00");
  assert.equal(result.daily_variable_average, "335.67");
  assert.equal(result.average_days, 9);
  assert.deepEqual(result.categories, [{ id: category.id, name: category.name, spending: "3021.00" }]);
  const us = await summary("month=2026-09&time_zone=America%2FLos_Angeles");
  assert.equal(us.average_days, 8); assert.equal(us.daily_variable_average, "377.63");
  assert.equal((await summary("month=2026-08")).daily_variable_average, "39.81");
  assert.equal((await summary("month=2026-10")).daily_variable_average, null);
  const empty = await summary("month=2026-07"); assert.equal(empty.transaction_count, 0); assert.equal(empty.total_paid, "0.00");
  await app.inject({ method: "PATCH", url: `/transactions/${normal.id}`, payload: { total_amount: "2100" } });
  assert.equal((await summary()).variable_spending, "3121.00");
  await app.inject({ method: "DELETE", url: `/transactions/${normal.id}?confirm=true` });
  result = await summary(); assert.equal(result.variable_spending, "1021.00");
  assert.equal(result.effective_spending, "15021.00");
  assert.equal((await app.inject("/dashboard?month=2026-13")).statusCode, 400);
  assert.equal((await app.inject("/dashboard?time_zone=Invalid")).statusCode, 400);
});
