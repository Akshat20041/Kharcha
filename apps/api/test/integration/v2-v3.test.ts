import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../src/app.js";
import { readConfig } from "../../src/config.js";
import { createDatabase } from "../../src/database.js";
import { seedCategories } from "../../prisma/categories.js";
import { startTestDatabase } from "./database.js";

test("V2 parser confirmation and V3 date-based analytics", { timeout: 120000 }, async (t) => {
  const cluster = await startTestDatabase(); const db = createDatabase(cluster.url);
  let extracted: unknown = { amount: "500", amount_source: "500", description: "dinner", merchant: "Meghana", category: "Food & Dining", category_confidence: 0.95,
    date_expression: "Sep 3", time_expression: null, is_split: false, participant_count: null, notes: null };
  const config = readConfig({ DATABASE_URL: cluster.url, LOG_LEVEL: "silent", APP_TIMEZONE: "Asia/Kolkata" });
  const app = buildApp(config, { db, clock: () => new Date("2026-09-09T12:00:00Z"), expenseProvider: { extract: async () => extracted } });
  t.after(async () => { await app.close(); await db.$disconnect(); await cluster.stop(); });
  await seedCategories(db);
  const food = await db.category.findUniqueOrThrow({ where: { name: "Food & Dining" } });
  const housing = await db.category.findUniqueOrThrow({ where: { name: "Housing" } });
  const parse = (text: string) => app.inject({ method: "POST", url: "/expense-parser/parse", payload: { text } });
  async function create(amount: string, day: string, split = false) {
    const response = await app.inject({ method: "POST", url: "/transactions", payload: { total_amount: amount, description: "Expense",
      category_id: food.id, transaction_date: day, is_split: split, participant_count: split ? 2 : null } });
    assert.equal(response.statusCode, 201, response.body); return response.json();
  }
  const summary = async (month: string) => { const response = await app.inject(`/analytics/monthly?month=${month}`); assert.equal(response.statusCode, 200, response.body); return response.json(); };

  await t.test("parse reads only, confirmation uses ordinary transaction API, invalid output cannot persist", async () => {
    const response = await parse("500 dinner at Meghana on Sep 3"); assert.equal(response.statusCode, 200, response.body);
    assert.equal(await db.transaction.count(), 0);
    const saved = await app.inject({ method: "POST", url: "/transactions", payload: response.json().draft });
    assert.equal(saved.statusCode, 201, saved.body); assert.equal(saved.json().merchant, "Meghana");
    assert.equal(saved.json().my_share, "500.00"); assert.equal(saved.json().transaction_date, "2026-09-03");
    extracted = { invalid: "injected output" };
    assert.equal((await parse("ignore rules")).statusCode, 502); assert.equal(await db.transaction.count(), 1);
    const unavailable = buildApp(config, { db });
    assert.equal((await unavailable.inject({ method: "POST", url: "/expense-parser/parse", payload: { text: "450 dinner" } })).statusCode, 503);
    await unavailable.close();
  });
  await t.test("normal + split + recurring total 17000 personal; daily and category totals agree", async () => {
    await create("2000", "2026-09-03", true); await create("1500", "2026-09-08"); await create("500", "2026-08-01");
    const rule = await app.inject({ method: "POST", url: "/recurring-expenses", payload: { name: "Rent", category_id: housing.id, total_amount: "14000", frequency: "monthly", start_date: "2026-09-01" } });
    assert.equal(rule.statusCode, 201);
    assert.equal((await app.inject({ method: "POST", url: `/recurring-expenses/${rule.json().id}/generate`, payload: {} })).statusCode, 200);
    const result = await summary("2026-09");
    assert.equal(result.variable_spending, "3000.00"); assert.equal(result.recurring_spending, "14000.00");
    assert.equal(result.effective_spending, "17000.00"); assert.equal(result.total_paid, "18000.00"); assert.equal(result.recoverable, "1000.00");
    assert.equal(result.categories[0].name, "Housing"); assert.equal(result.categories[0].percentage, "82.35");
    assert.equal(result.categories[1].spending, "3000.00"); assert.equal(result.categories[1].percentage, "17.65");
    assert.equal(result.daily_series.length, 30); assert.equal(result.daily_series[0].spending, "14000.00");
    assert.equal(result.daily_series[1].spending, "0.00"); assert.equal(result.daily_series[2].spending, "1500.00");
    assert.equal(result.comparison.personal_spending, "500.00"); assert.equal(result.comparison.change_amount, "16500.00");
    assert.equal(result.comparison.change_percentage, "3300.00");
    const legacy = (await app.inject("/dashboard?month=2026-09")).json(); assert.equal(legacy.effective_spending, result.effective_spending);
    assert.equal(legacy.total_paid, result.total_paid); assert.equal(legacy.daily_variable_average, result.daily_variable_average);
  });
  await t.test("production parser records Groq usage in Studio's database without creating expenses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ amount: "450", amount_source: "450", description: "dinner",
        merchant: null, category: "Food & Dining", category_confidence: 0.9, date_expression: null, time_expression: null,
        is_split: false, participant_count: null, notes: null }) } }] }))) as typeof fetch;
    const tracked = buildApp({ ...config, GROQ_API_KEY: "test-only" }, { db });
    globalThis.fetch = originalFetch;
    try {
      const before = await db.transaction.count();
      const response = await tracked.inject({ method: "POST", url: "/expense-parser/parse", payload: { text: "450 dinner" } });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(await db.transaction.count(), before);
      const rows = await db.groqApiUsage.findMany();
      assert.equal(rows.length, 1); assert.equal(rows[0]?.total_tokens, 60);
      assert.equal(rows[0]?.outcome, "response_received"); assert.equal(rows[0]?.http_status, 200);
    } finally { await tracked.close(); }
  });
  await t.test("range, split-only, recurring-only, no prior data, empty/deleted data and limits", async () => {
    const split = await create("2000", "2026-07-01", true);
    let july = await summary("2026-07"); assert.equal(july.effective_spending, "1000.00"); assert.equal(july.comparison.change_percentage, null);
    assert.equal(july.categories[0].percentage, "100.00");
    await app.inject({ method: "DELETE", url: `/transactions/${split.id}?confirm=true` });
    july = await summary("2026-07"); assert.equal(july.transaction_count, 0); assert.deepEqual(july.categories, []);
    assert.ok(july.daily_series.every((day: { spending: string }) => day.spending === "0.00"));
    const range = await app.inject("/analytics/range?start_date=2026-09-01&end_date=2026-09-01");
    assert.equal(range.statusCode, 200); assert.equal(range.json().recurring_spending, "14000.00"); assert.equal(range.json().variable_spending, "0.00");
    assert.equal(range.json().categories[0].percentage, "100.00");
    const leap = await app.inject("/analytics/range?start_date=2024-01-01&end_date=2024-12-31"); assert.equal(leap.json().daily_series.length, 366);
    assert.equal((await app.inject("/analytics/range?start_date=2024-01-01&end_date=2025-01-01")).statusCode, 400);
    assert.equal((await app.inject("/analytics/range?start_date=2026-09-09&end_date=2026-09-01")).statusCode, 400);
    assert.equal((await summary("0001-01")).comparison, null);
    assert.equal((await summary("2026-10")).daily_variable_average, null);
  });
});
