import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildApp } from "../../src/app.js";
import { readConfig } from "../../src/config.js";
import { createDatabase } from "../../src/database.js";
import { LOCAL_USER_ID } from "../../src/identity.js";
import { transactionData } from "../../src/transactions/domain.js";
import { seedCategories } from "../../prisma/categories.js";
import { startTestDatabase } from "./database.js";

test("user ownership isolates every finance operation and preserves legacy data", { timeout: 120000 }, async (t) => {
  const cluster = await startTestDatabase();
  const db = createDatabase(cluster.url);
  const ids = [randomUUID(), randomUUID()];
  await db.user.createMany({ data: ids.map((id) => ({ id })) });
  await seedCategories(db);
  const category = await db.category.findFirstOrThrow();
  const config = readConfig({ DATABASE_URL: cluster.url, NODE_ENV: "production", AUTH_MODE: "supabase", SUPABASE_URL: "https://auth.example.test", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", WEB_ORIGIN: "https://app.example.test", LOG_LEVEL: "silent", APP_TIMEZONE: "Asia/Kolkata" });
  // Trusted server injection only: there is no HTTP test-user switch.
  const apps = ids.map((id) => buildApp(config, { db, resolveIdentity: async () => id, clock: () => new Date("2026-09-11T12:00:00Z") }));
  t.after(async () => { for (const app of apps) await app.close(); await db.$disconnect(); await cluster.stop(); });
  const expenses: string[] = [], rules: string[] = [];
  const amounts = ["100", "900"];
  for (const [index, app] of apps.entries()) {
    const create = await app.inject({ method: "POST", url: "/transactions", payload: {
      description: `Private expense ${index}`, total_amount: amounts[index], category_id: category.id, transaction_date: "2026-09-01",
    } });
    assert.equal(create.statusCode, 201, create.body);
    assert.equal(create.json().user_id, ids[index]);
    expenses.push(create.json().id);
    const previous = await app.inject({ method: "POST", url: "/transactions", payload: {
      description: `Prior expense ${index}`, total_amount: amounts[index], category_id: category.id, transaction_date: "2026-08-15",
    } });
    assert.equal(previous.statusCode, 201);
    const rule = await app.inject({ method: "POST", url: "/recurring-expenses", payload: {
      name: `Private rule ${index}`, total_amount: "50", category_id: category.id, frequency: "monthly", start_date: "2026-09-01",
    } });
    assert.equal(rule.statusCode, 201, rule.body);
    rules.push(rule.json().id);
  }

  for (const [index, app] of apps.entries()) {
    const other = 1 - index;
    await t.test(`user ${index} cannot read or mutate user ${other}'s data`, async () => {
      const list = (await app.inject("/transactions?limit=1&offset=1")).json();
      assert.equal(list.data.length, 1);
      assert.ok(list.data.every((row: { user_id: string }) => row.user_id === ids[index]));
      assert.equal((await app.inject(`/transactions/${expenses[other]}`)).statusCode, 404);
      assert.equal((await app.inject({ method: "PATCH", url: `/transactions/${expenses[other]}`, payload: { total_amount: "1" } })).statusCode, 404);
      assert.equal((await app.inject({ method: "DELETE", url: `/transactions/${expenses[other]}?confirm=true` })).statusCode, 404);
      const ruleList = (await app.inject("/recurring-expenses")).json().data;
      assert.deepEqual(ruleList.map((row: { id: string }) => row.id), [rules[index]]);
      assert.equal((await app.inject({ method: "PATCH", url: `/recurring-expenses/${rules[other]}`, payload: { is_active: false } })).statusCode, 404);
      assert.equal((await app.inject({ method: "POST", url: `/recurring-expenses/${rules[other]}/generate`, payload: {} })).statusCode, 404);
      assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: expenses[other] } })).total_amount.toFixed(0), amounts[other]);
      assert.equal((await db.recurringExpense.findUniqueOrThrow({ where: { id: rules[other] } })).is_active, true);
    });
    await t.test(`user ${index}'s totals, comparisons and Excel contain only their data`, async () => {
      const dashboard = (await app.inject("/dashboard?month=2026-09")).json();
      assert.equal(dashboard.effective_spending, `${amounts[index]}.00`);
      assert.equal(dashboard.transaction_count, 1);
      for (const path of ["/analytics/monthly?month=2026-09", "/analytics/range?start_date=2026-09-01&end_date=2026-09-30"]) {
        const analytics = (await app.inject(path)).json();
        assert.equal(analytics.effective_spending, `${amounts[index]}.00`);
        assert.equal(analytics.comparison.personal_spending, `${amounts[index]}.00`);
        assert.equal(analytics.categories[0].spending, `${amounts[index]}.00`);
        assert.equal(analytics.daily_series[0].spending, `${amounts[index]}.00`);
      }
      for (const query of ["", "?start_date=2026-09-01&end_date=2026-09-30"]) {
        const response = await app.inject(`/exports/expenses.xlsx${query}`);
        assert.equal(response.statusCode, 200);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(response.rawPayload as unknown as ExcelJS.Buffer);
        assert.equal(workbook.getWorksheet("Summary")!.getCell("A6").result, Number(amounts[index]) * (query ? 1 : 2));
        const zip = await JSZip.loadAsync(response.rawPayload);
        const xml = (await Promise.all(zip.file(/\.xml$/).map((entry) => entry.async("string")))).join("\n");
        assert.ok(xml.includes(`Private expense ${index}`));
        assert.ok(!xml.includes(`Private expense ${other}`));
        assert.ok(!xml.includes(`Prior expense ${other}`));
      }
    });
  }

  await t.test("identity spoofing is rejected or ignored, and missing identity fails closed", async () => {
    const app = apps[0]!;
    const spoofed = await app.inject({ url: "/transactions", headers: { "x-user-id": ids[1]!, authorization: `Bearer ${ids[1]}` } });
    assert.ok(spoofed.json().data.every((row: { user_id: string }) => row.user_id === ids[0]));
    for (const key of ["user_id", "userId"]) {
      assert.equal((await app.inject({ method: "POST", url: "/transactions", payload: {
        description: "Spoof", total_amount: "1", category_id: category.id, [key]: ids[1],
      } })).statusCode, 400);
      assert.equal((await app.inject({ method: "PATCH", url: `/transactions/${expenses[0]}`, payload: { [key]: ids[1] } })).statusCode, 400);
      assert.equal((await app.inject(`/transactions?${key}=${ids[1]}`)).statusCode, 400);
      assert.equal((await app.inject({ method: "POST", url: "/recurring-expenses", payload: {
        name: "Spoof", total_amount: "1", category_id: category.id, frequency: "monthly", start_date: "2026-09-01", [key]: ids[1],
      } })).statusCode, 400);
    }
    for (const resolveIdentity of [undefined, async () => null, async () => "invalid"]) {
      const denied = buildApp(config, { db, resolveIdentity });
      try {
        assert.equal((await denied.inject("/health")).statusCode, 200);
        for (const url of ["/transactions", "/categories", "/recurring-expenses", "/dashboard", "/analytics/monthly", "/exports/expenses.xlsx"]) {
          assert.equal((await denied.inject({ url, headers: { "x-user-id": ids[0]! } })).statusCode, 401);
        }
        assert.equal((await denied.inject({ method: "POST", url: "/expense-parser/parse", payload: { text: "100 coffee" } })).statusCode, 401);
      } finally { await denied.close(); }
    }
  });

  await t.test("recurring generation remains idempotent and database rejects cross-owner links", async () => {
    for (const [index, app] of apps.entries()) {
      const results = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: `/recurring-expenses/${rules[index]}/generate`, payload: {} })));
      assert.ok(results.every((response) => response.statusCode === 200));
      assert.equal(results.reduce((sum, response) => sum + response.json().created, 0), 1);
      const generated = await db.transaction.findMany({ where: { recurring_expense_id: rules[index] } });
      assert.equal(generated.length, 1); assert.equal(generated[0]!.user_id, ids[index]);
      assert.equal((await app.inject({ method: "PATCH", url: `/transactions/${expenses[index]}`, payload: { notes: "Own edit" } })).statusCode, 200);
      assert.equal((await app.inject({ method: "PATCH", url: `/recurring-expenses/${rules[index]}`, payload: { is_active: false } })).statusCode, 200);
    }
    const data = { ...transactionData({ total_amount: "50", description: "Invalid link", category_id: category.id }, "Asia/Kolkata", new Date()),
      user_id: ids[0]!, expense_nature: "recurring_generated" as const, recurring_expense_id: rules[1]!, occurrence_date: new Date("2026-10-01") };
    await assert.rejects(db.transaction.create({ data }), (error: unknown) => (error as { code: string }).code === "P2003");
    await assert.rejects(db.transaction.create({ data: { ...data, user_id: randomUUID() } }));
    const generated = await db.transaction.findFirstOrThrow({ where: { recurring_expense_id: rules[0] } });
    await assert.rejects(db.transaction.update({ where: { id: generated.id }, data: { user_id: ids[1]! } }));
    await assert.rejects(db.recurringExpense.update({ where: { id: rules[0] }, data: { user_id: ids[1]! } }));
    for (const [index, app] of apps.entries()) assert.equal((await app.inject({ method: "DELETE", url: `/transactions/${expenses[index]}?confirm=true` })).statusCode, 204);
  });

  await t.test("usage recording follows the requesting user without saving expenses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("{}", { status: 429 });
    const tracked = ids.map((id) => buildApp({ ...config, GROQ_API_KEY: "test-only" }, { db, resolveIdentity: async () => id }));
    globalThis.fetch = originalFetch;
    try {
      const before = await db.transaction.count();
      await Promise.all(tracked.map(async (app) => {
        const response = await app.inject({ method: "POST", url: "/expense-parser/parse", payload: { text: "100 coffee" } });
        assert.equal(response.statusCode, 429);
      }));
      for (const user_id of ids) {
        const rows = await db.groqApiUsage.findMany({ where: { user_id } });
        assert.equal(rows.length, 1); assert.equal(rows[0]!.outcome, "http_error");
      }
      assert.equal(await db.transaction.count(), before);
    } finally { for (const app of tracked) await app.close(); }
  });

  await t.test("migration backfills populated legacy tables without changing existing values", async () => {
    const client = new pg.Client({ connectionString: cluster.url });
    await client.connect();
    try {
      // A separate schema inside this disposable cluster reproduces the old product.
      await client.query('CREATE SCHEMA legacy_fixture; SET search_path TO legacy_fixture');
      for (const name of ["202609080001_initial", "202609080002_integrity", "20260910000000_groq_api_usage"]) {
        await client.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
      }
      const categoryId = randomUUID(), ruleId = randomUUID();
      await client.query('INSERT INTO categories (id, name) VALUES ($1, $2)', [categoryId, "Legacy"]);
      await client.query(`INSERT INTO recurring_expenses (id, name, category_id, total_amount, my_share, frequency, start_date, next_due_date, time_zone)
        VALUES ($1, 'Legacy rent', $2, 1000, 1000, 'monthly', '2026-09-01', '2026-10-01', 'Asia/Kolkata')`, [ruleId, categoryId]);
      await client.query(`INSERT INTO transactions (id, category_id, total_amount, my_share, recoverable_amount, description, transaction_date, transaction_time, time_zone,
        expense_nature, recurring_expense_id, occurrence_date) VALUES ($1, $2, 1000, 1000, 0, 'Legacy rent', '2026-09-01', '12:30', 'Asia/Kolkata', 'recurring_generated', $3, '2026-09-01')`, [randomUUID(), categoryId, ruleId]);
      await client.query(`INSERT INTO transactions (id, category_id, total_amount, my_share, recoverable_amount, description, transaction_date, transaction_time, time_zone,
        is_split, participant_count, split_type) VALUES ($1, $2, 1000, 333.33, 666.67, 'Legacy split', '2026-09-02', '23:59', 'Asia/Kolkata', true, 3, 'equal')`, [randomUUID(), categoryId]);
      await client.query("INSERT INTO groq_api_usage (id, model, outcome, duration_ms) VALUES ($1, 'legacy-model', 'response_received', 12)", [randomUUID()]);
      const tables = ["transactions", "recurring_expenses", "groq_api_usage"];
      const before = [];
      for (const table of tables) before.push(await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`));
      await client.query(await readFile(new URL("../../prisma/migrations/20260911000000_user_ownership/migration.sql", import.meta.url), "utf8"));
      for (const [index, table] of tables.entries()) {
        const after = await client.query(`SELECT to_jsonb(t) - 'user_id' AS row FROM ${table} t ORDER BY id`);
        assert.deepEqual(after.rows, before[index]!.rows);
        const owners = await client.query(`SELECT DISTINCT user_id FROM ${table}`);
        assert.deepEqual(owners.rows, [{ user_id: LOCAL_USER_ID }]);
      }
      const owners = await client.query("SELECT column_default, is_nullable FROM information_schema.columns WHERE table_schema = 'legacy_fixture' AND column_name = 'user_id'");
      assert.equal(owners.rows.length, 3);
      assert.ok(owners.rows.every((row) => row.column_default === null && row.is_nullable === "NO"));
    } finally { await client.end(); }
  });
});

