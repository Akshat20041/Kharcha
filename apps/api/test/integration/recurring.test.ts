import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../src/app.js";
import { readConfig } from "../../src/config.js";
import { createDatabase } from "../../src/database.js";
import { seedCategories } from "../../prisma/categories.js";
import { startTestDatabase } from "./database.js";

test("recurring API persists rules and generates occurrences safely", { timeout: 120000 }, async (t) => {
  const cluster = await startTestDatabase();
  const db = createDatabase(cluster.url);
  let now = new Date("2026-09-08T20:00:00Z");
  const app = buildApp(readConfig({ DATABASE_URL: cluster.url, LOG_LEVEL: "silent", APP_TIMEZONE: "Asia/Kolkata" }), { db, clock: () => now });
  t.after(async () => { await app.close(); await db.$disconnect(); await cluster.stop(); });
  await seedCategories(db);
  const category = await db.category.findFirstOrThrow();
  const base = { name: "Rent", category_id: category.id, total_amount: "14000", frequency: "monthly", start_date: "2026-09-01" };
  async function create(extra: Record<string, unknown> = {}) {
    const response = await app.inject({ method: "POST", url: "/recurring-expenses", payload: { ...base, ...extra } });
    assert.equal(response.statusCode, 201, response.body); return response.json();
  }
  const generate = (id: string) => app.inject({ method: "POST", url: `/recurring-expenses/${id}/generate`, payload: {} });
  const patch = (id: string, payload: Record<string, unknown>) => app.inject({ method: "PATCH", url: `/recurring-expenses/${id}`, payload });

  await t.test("rent, split, concurrent idempotency, and historical edits", async () => {
    const rent = await create();
    const responses = await Promise.all([generate(rent.id), generate(rent.id)]);
    assert.ok(responses.every((response) => response.statusCode === 200));
    assert.equal(responses.reduce((sum, response) => sum + response.json().created, 0), 1);
    const first = await db.transaction.findFirstOrThrow({ where: { recurring_expense_id: rent.id } });
    assert.equal(first.my_share.toFixed(2), "14000.00");
    assert.equal(first.expense_nature, "recurring_generated");
    assert.equal(first.transaction_date.toISOString().slice(0, 10), "2026-09-01");
    assert.equal((await patch(rent.id, { total_amount: "15000" })).statusCode, 200);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: first.id } })).total_amount.toFixed(2), "14000.00");
    assert.equal((await patch(rent.id, { frequency: "weekly" })).statusCode, 400);
    now = new Date("2026-10-01T12:00:00Z");
    assert.equal((await generate(rent.id)).json().created, 1);
    const latest = await db.transaction.findFirstOrThrow({ where: { recurring_expense_id: rent.id }, orderBy: { occurrence_date: "desc" } });
    assert.equal(latest.total_amount.toFixed(2), "15000.00");
    await app.inject({ method: "DELETE", url: `/transactions/${latest.id}?confirm=true` });
    assert.equal((await generate(rent.id)).json().created, 0);
    const wifi = await create({ name: "WiFi", total_amount: "1500", is_split: true, participant_count: 3, start_date: "2026-10-01" });
    assert.equal((await generate(wifi.id)).json().created, 1);
    const split = await db.transaction.findFirstOrThrow({ where: { recurring_expense_id: wifi.id } });
    assert.equal(split.my_share.toFixed(2), "500.00"); assert.equal(split.recoverable_amount.toFixed(2), "1000.00");
    assert.equal((await patch(wifi.id, { is_active: false })).statusCode, 200);
    assert.equal((await generate(wifi.id)).statusCode, 409);
  });

  await t.test("catch-up clamps month ends and respects inclusive end dates", async () => {
    now = new Date("2026-10-01T12:00:00Z");
    const rule = await create({ start_date: "2026-01-31", end_date: "2026-03-31" });
    const response = await generate(rule.id);
    assert.equal(response.json().created, 3);
    const rows = await db.transaction.findMany({ where: { recurring_expense_id: rule.id }, orderBy: { occurrence_date: "asc" } });
    assert.deepEqual(rows.map((row) => row.occurrence_date!.toISOString().slice(0, 10)), ["2026-01-31", "2026-02-28", "2026-03-31"]);
    assert.equal((await generate(rule.id)).json().created, 0);
    const future = await create({ start_date: "2027-01-01" });
    assert.equal((await generate(future.id)).json().created, 0);
    assert.equal((await patch(future.id, { start_date: "2027-02-01", frequency: "yearly" })).json().next_due_date, "2027-02-01");
  });

  await t.test("timezone boundaries, batches, validation, and list pagination", async () => {
    now = new Date("2026-09-08T20:00:00Z");
    const india = await create({ start_date: "2026-09-09", time_zone: "Asia/Kolkata" });
    const america = await create({ start_date: "2026-09-09", time_zone: "America/Los_Angeles" });
    assert.equal((await generate(india.id)).json().created, 1);
    assert.equal((await generate(america.id)).json().created, 0);
    const backlog = await create({ start_date: "2024-01-01", frequency: "weekly" });
    const batch = (await generate(backlog.id)).json();
    assert.equal(batch.created, 100); assert.equal(batch.has_more, true);
    const rest = (await generate(backlog.id)).json();
    assert.ok(rest.created > 0); assert.equal(rest.has_more, false);
    assert.equal((await generate(backlog.id)).json().created, 0);
    const before = await db.recurringExpense.count();
    for (const extra of [{ my_share: "1" }, { category_id: "00000000-0000-4000-8000-000000000000" }, { end_date: "2020-01-01" }, { is_split: true }]) {
      assert.equal((await app.inject({ method: "POST", url: "/recurring-expenses", payload: { ...base, ...extra } })).statusCode, 400);
    }
    assert.equal(await db.recurringExpense.count(), before);
    const page = await app.inject("/recurring-expenses?limit=1&offset=1");
    assert.equal(page.statusCode, 200); assert.equal(page.json().data.length, 1);
    assert.equal((await patch("00000000-0000-4000-8000-000000000000", { name: "Missing" })).statusCode, 404);
  });
});
