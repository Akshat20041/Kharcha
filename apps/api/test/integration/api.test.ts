import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { buildApp } from "../../src/app.js";
import { readConfig } from "../../src/config.js";
import { createDatabase } from "../../src/database.js";
import { defaultCategories, seedCategories } from "../../prisma/categories.js";
import { transactionData } from "../../src/transactions/domain.js";
import { startTestDatabase } from "./database.js";
import { LOCAL_USER_ID } from "../../src/identity.js";

test("PostgreSQL migrations, constraints, seeds, and transaction API", { timeout: 120000 }, async (t) => {
  const cluster = await startTestDatabase();
  const db = createDatabase(cluster.url);
  const config = readConfig({ DATABASE_URL: cluster.url, LOG_LEVEL: "silent", APP_TIMEZONE: "Asia/Kolkata" });
  const app = buildApp(config, { db, clock: () => new Date("2026-09-08T20:00:00Z") });
  t.after(async () => { await app.close(); await db.$disconnect(); await cluster.stop(); });
  await seedCategories(db);
  const category = await db.category.findUniqueOrThrow({ where: { name: "Food & Dining" } });
  const base = { total_amount: "500", description: "Dinner", category_id: category.id };
  const create = (override: Record<string, unknown> = {}) => app.inject({ method: "POST", url: "/transactions", payload: { ...base, ...override } });
  t.beforeEach(async () => { await db.transaction.deleteMany(); await db.recurringExpense.deleteMany(); });

  await t.test("migration history and schema have expected constraints", async () => {
    const migrations = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    assert.equal(migrations[0]?.count, 5n);
    const checks = await db.$queryRaw<Array<{ conname: string }>>`SELECT conname::text FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`;
    assert.ok(checks.some((row) => row.conname === "transactions_split_valid"));
    assert.ok(checks.some((row) => row.conname === "recurring_dates_valid"));
  });

  await t.test("seed is idempotent and categories are readable", async () => {
    await seedCategories(db);
    assert.equal(await db.category.count(), defaultCategories.length);
    assert.equal((await db.category.findUniqueOrThrow({ where: { name: category.name } })).id, category.id);
    const response = await app.inject("/categories");
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.length, 16);
  });

  await t.test("simple expense persists, has local defaults, and survives a new API instance", async () => {
    const response = await create();
    assert.equal(response.statusCode, 201, response.body);
    const row = response.json();
    assert.equal(response.headers.location, `/transactions/${row.id}`);
    assert.equal(row.total_amount, "500.00");
    assert.equal(row.my_share, "500.00");
    assert.equal(row.recoverable_amount, "0.00");
    assert.equal(row.transaction_date, "2026-09-09");
    assert.equal(row.transaction_time, "01:30:00");
    assert.equal(row.currency, "INR");
    assert.equal(row.expense_nature, "variable");
    assert.equal(row.transaction_type, "expense");
    assert.equal(row.participant_count, null);
    const secondApp = buildApp(config);
    try {
      const read = await secondApp.inject(`/transactions/${row.id}`);
      assert.equal(read.statusCode, 200);
      assert.deepEqual(read.json(), row);
    } finally { await secondApp.close(); }
  });

  await t.test("split calculations round exactly and preserve total paid", async () => {
    for (const [amount, participants, share, recoverable] of [
      ["1200", 4, "300.00", "900.00"], ["1000", 3, "333.33", "666.67"],
      ["0.01", 2, "0.01", "0.00"], ["999999999999.99", 3, "333333333333.33", "666666666666.66"],
    ] as const) {
      const response = await create({ total_amount: amount, is_split: true, participant_count: participants });
      assert.equal(response.statusCode, 201, response.body);
      assert.equal(response.json().my_share, share);
      assert.equal(response.json().recoverable_amount, recoverable);
    }
  });

  await t.test("past expenses retain local date/time and history is newest first with pagination", async () => {
    const newer = (await create({ transaction_date: "2026-09-07", transaction_time: "10:00" })).json();
    const older = (await create({ transaction_date: "2026-09-05", transaction_time: "20:30", notes: "Past meal" })).json();
    assert.equal(older.transaction_date, "2026-09-05");
    assert.equal(older.transaction_time, "20:30:00");
    assert.ok(older.created_at.endsWith("Z"));
    assert.notEqual(older.created_at.slice(0, 10), older.transaction_date);
    const response = await app.inject("/transactions?limit=1&offset=0");
    assert.equal(response.json().data[0].id, newer.id);
    const second = await app.inject("/transactions?limit=1&offset=1");
    assert.equal(second.json().data[0].id, older.id);
    assert.equal((await app.inject("/transactions?limit=0")).statusCode, 400);
    assert.equal((await app.inject("/transactions?offset=-1")).statusCode, 400);
  });

  await t.test("request timezone controls defaults independently of the server timezone", async () => {
    const response = await create({ time_zone: "America/Los_Angeles" });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().transaction_date, "2026-09-08");
    assert.equal(response.json().transaction_time, "13:00:00");
  });

  await t.test("partial edits recalculate money, preserve dates, and support split transitions", async () => {
    const row = (await create({ total_amount: "1000", is_split: true, participant_count: 3, notes: "old" })).json();
    const patch = (payload: object) => app.inject({ method: "PATCH", url: `/transactions/${row.id}`, payload });
    const edited = await patch({ total_amount: "1200", participant_count: 4, notes: null });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(edited.json().my_share, "300.00");
    assert.equal(edited.json().recoverable_amount, "900.00");
    assert.equal(edited.json().transaction_date, row.transaction_date);
    assert.equal(edited.json().created_at, row.created_at);
    assert.ok(edited.json().updated_at >= row.updated_at);
    assert.equal(edited.json().notes, null);
    const unsplit = (await patch({ is_split: false })).json();
    assert.equal(unsplit.my_share, "1200.00");
    assert.equal(unsplit.recoverable_amount, "0.00");
    assert.equal(unsplit.participant_count, null);
    assert.equal(unsplit.split_type, null);
    assert.equal((await patch({ is_split: true })).statusCode, 400);
    assert.equal((await patch({ is_split: true, participant_count: 2 })).json().my_share, "600.00");
    assert.equal((await patch({})).statusCode, 400);
    assert.equal((await patch({ total_amount: "-1" })).statusCode, 400);
    assert.equal((await patch({ category_id: randomUUID() })).statusCode, 400);
    const read = (await app.inject(`/transactions/${row.id}`)).json();
    assert.equal(read.total_amount, "1200.00");
    assert.equal(read.category_id, category.id);
  });

  await t.test("concurrent partial updates preserve both changes and calculated amounts", async () => {
    const row = (await create()).json();
    const responses = await Promise.all([
      app.inject({ method: "PATCH", url: `/transactions/${row.id}`, payload: { total_amount: "600" } }),
      app.inject({ method: "PATCH", url: `/transactions/${row.id}`, payload: { notes: "Keep this" } }),
    ]);
    for (const response of responses) assert.equal(response.statusCode, 200, response.body);
    const read = (await app.inject(`/transactions/${row.id}`)).json();
    assert.equal(read.notes, "Keep this");
    assert.equal(read.my_share, "600.00");
    assert.equal(read.total_amount, "600.00");
  });

  await t.test("delete requires confirmation and removes the stored transaction", async () => {
    const row = (await create()).json();
    assert.equal((await app.inject({ method: "DELETE", url: `/transactions/${row.id}` })).statusCode, 400);
    const deleted = await app.inject({ method: "DELETE", url: `/transactions/${row.id}?confirm=true` });
    assert.equal(deleted.statusCode, 204);
    assert.equal(deleted.body, "");
    assert.equal((await app.inject(`/transactions/${row.id}`)).statusCode, 404);
    assert.equal((await app.inject("/transactions")).json().data.length, 0);
    assert.equal((await app.inject({ method: "DELETE", url: `/transactions/${row.id}?confirm=true` })).statusCode, 404);
  });

  await t.test("bad requests cannot insert records or override server-owned fields", async () => {
    for (const override of [
      { total_amount: "abc" }, { total_amount: "0" }, { total_amount: "0.001" }, { total_amount: 500 },
      { description: " " }, { category_id: randomUUID() }, { is_split: true },
      { is_split: true, participant_count: 1 }, { participant_count: 3 }, { split_type: "custom" },
      { my_share: "0" }, { recoverable_amount: "0" }, { transaction_type: "income" },
      { expense_nature: "recurring_generated" }, { transaction_date: "2026-02-30" },
      { transaction_time: "24:00" }, { time_zone: "bad" }, { created_at: "2026-09-01" },
    ]) assert.equal((await create(override)).statusCode, 400, JSON.stringify(override));
    assert.equal(await db.transaction.count(), 0);
    assert.equal((await app.inject("/transactions/bad-id")).statusCode, 400);
    assert.equal((await app.inject(`/transactions/${randomUUID()}`)).statusCode, 404);
    assert.equal((await app.inject({ method: "PATCH", url: `/transactions/${randomUUID()}`, payload: { description: "Missing" } })).statusCode, 404);
    assert.equal((await app.inject({ method: "POST", url: "/transactions", headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
  });

  await t.test("database constraints reject inconsistent financial and relational records", async () => {
    const data = { ...transactionData(base, "Asia/Kolkata", new Date()), user_id: LOCAL_USER_ID };
    for (const override of [
      { total_amount: "0" }, { total_amount: "-1" }, { total_amount: "NaN" },
      { my_share: "600", recoverable_amount: "-100" }, { recoverable_amount: "1" },
      { is_split: true }, { is_split: true, participant_count: 1, split_type: "equal" as const },
      { is_split: true, participant_count: 3, split_type: "equal" as const, my_share: "100", recoverable_amount: "400" },
      { participant_count: 2 }, { category_id: randomUUID() }, { description: " " },
      { expense_nature: "recurring_generated" as const },
    ]) await assert.rejects(() => db.transaction.create({ data: { ...data, ...override } }));
    await db.transaction.create({ data });
    await assert.rejects(() => db.category.delete({ where: { id: category.id } }));
  });

  await t.test("recurring schema enforces dates/splits, occurrence uniqueness, and historical independence", async () => {
    const ruleData = { user_id: LOCAL_USER_ID, name: "WiFi", category_id: category.id, total_amount: "1500", my_share: "500",
      is_split: true, participant_count: 3, frequency: "monthly" as const,
      start_date: new Date("2026-09-01"), next_due_date: new Date("2026-09-01"), time_zone: "Asia/Kolkata" };
    await assert.rejects(() => db.recurringExpense.create({ data: { ...ruleData, end_date: new Date("2026-08-31") } }));
    await assert.rejects(() => db.recurringExpense.create({ data: { ...ruleData, participant_count: null } }));
    const rule = await db.recurringExpense.create({ data: ruleData });
    const instanceData = { ...transactionData({ ...base, total_amount: "1500", is_split: true, participant_count: 3 }, "Asia/Kolkata", new Date()),
      user_id: LOCAL_USER_ID, expense_nature: "recurring_generated" as const, recurring_expense_id: rule.id, occurrence_date: new Date("2026-09-01") };
    const instance = await db.transaction.create({ data: instanceData });
    await assert.rejects(() => db.transaction.create({ data: instanceData }));
    await db.recurringExpense.update({ where: { id: rule.id }, data: { total_amount: "1800", my_share: "600" } });
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: instance.id } })).my_share.toFixed(2), "500.00");
    const edited = await app.inject({ method: "PATCH", url: `/transactions/${instance.id}`, payload: { total_amount: "1200" } });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(edited.json().my_share, "400.00");
    assert.equal(edited.json().occurrence_date, "2026-09-01");
    assert.equal((await db.recurringExpense.findUniqueOrThrow({ where: { id: rule.id } })).my_share.toFixed(2), "600.00");
    await assert.rejects(() => db.recurringExpense.delete({ where: { id: rule.id } }));
    const recurring = await app.inject("/recurring-expenses");
    assert.equal(recurring.statusCode, 200);
    assert.equal(recurring.json().data[0].my_share, "600.00");
  });

  await t.test("unexpected database failures return a generic error", async () => {
    const badApp = buildApp(readConfig({ ...config, PORT: String(config.PORT), DATABASE_URL: "postgresql://none:none@127.0.0.1:1/missing" }));
    try {
      const response = await badApp.inject("/transactions");
      assert.equal(response.statusCode, 500);
      assert.deepEqual(response.json(), { error: "Internal server error" });
    } finally { await badApp.close(); }
  });
});
