import assert from "node:assert/strict";
import test from "node:test";
import { editDraft, money, newDraft, prepareExpense, displayDate, displayTime } from "../src/lib/expense";
import { api, ApiError } from "../src/lib/api";
import type { Transaction } from "../src/lib/types";

const base = { ...newDraft(new Date(2026, 8, 8, 23, 45, 12)), total_amount: "500", description: "Dinner", category_id: "from-api" };

test("form defaults use local calendar time, not the UTC date", () => {
  assert.equal(base.transaction_date, "2026-09-08");
  assert.equal(base.transaction_time, "23:45:12");
  assert.equal(base.time_zone, Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test("input preserves money as strings and never submits calculated fields", () => {
  const { errors, input } = prepareExpense({ ...base, total_amount: "000500.50", is_split: true, participant_count: "4" });
  assert.deepEqual(errors, {});
  assert.equal(input.total_amount, "500.50");
  assert.equal(input.participant_count, 4);
  assert.equal("my_share" in input, false);
  assert.equal("recoverable_amount" in input, false);
  assert.equal(prepareExpense({ ...base, total_amount: ".50" }).input.total_amount, "0.50");
  assert.equal(prepareExpense({ ...base, is_split: false, participant_count: "4" }).input.participant_count, null);
});

test("invalid inputs receive field errors before a request is sent", () => {
  for (const amount of ["0", "-1", "1.001", "1e3", "NaN", "1000000000000", ""]) {
    assert.ok(prepareExpense({ ...base, total_amount: amount }).errors.total_amount);
  }
  for (const value of ["1", "2.5", "", "2147483648"]) {
    assert.ok(prepareExpense({ ...base, is_split: true, participant_count: value }).errors.participant_count);
  }
  assert.ok(prepareExpense({ ...base, transaction_date: "2026-02-30" }).errors.transaction_date);
  assert.ok(prepareExpense({ ...base, transaction_time: "24:00" }).errors.transaction_time);
  assert.ok(prepareExpense({ ...base, description: " " }).errors.description);
  assert.ok(prepareExpense({ ...base, category_id: "" }).errors.category_id);
});

test("editing preserves the saved timezone and historical date/time", () => {
  const row = { ...base, id: "test", total_amount: "600.00", my_share: "600.00", recoverable_amount: "0.00",
    currency: "INR", notes: null, participant_count: null, expense_nature: "variable",
    time_zone: "America/Los_Angeles", transaction_date: "2026-09-05", transaction_time: "20:30:45" } as Transaction;
  const { input, errors } = prepareExpense(editDraft(row));
  assert.deepEqual(errors, {});
  assert.equal(input.time_zone, row.time_zone);
  assert.equal(input.transaction_time, "20:30:45");
  assert.equal(input.transaction_date, "2026-09-05");
  assert.equal(input.notes, null);
  assert.match(displayDate(input.transaction_date), /5 Sept? 2026/);
  assert.equal(displayTime("20:30:45"), "8:30 pm");
});

test("money display does not lose decimal precision", () => {
  assert.equal(money("1200.00"), "₹1,200.00");
  assert.equal(money("999999999999.99"), "₹9,99,99,99,99,999.99");
  assert.equal(money("0.01"), "₹0.01");
});

test("API client sends the existing contract and handles 204 and validation errors", async (t) => {
  const original = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";
  t.after(() => { if (original === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = original; });
  const { input } = prepareExpense(base);
  const mock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(url, "http://localhost:3001/transactions");
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(options!.body as string), input);
    return new Response(JSON.stringify({ ...input, my_share: "500.00", recoverable_amount: "0.00" }), { status: 201 });
  });
  assert.equal((await api.create(input)).my_share, "500.00");
  mock.mock.mockImplementation(async (url, options) => {
    assert.equal(url, "http://localhost:3001/transactions/a?confirm=true");
    assert.equal(options?.method, "DELETE");
    return new Response(null, { status: 204 });
  });
  await api.delete("a");
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({ error: "Validation failed", issues: [{ field: "category_id", message: "Invalid category" }] }), { status: 400 }));
  await assert.rejects(api.create(input), (error: unknown) => error instanceof ApiError && error.issues.category_id === "Invalid category");
  mock.mock.mockImplementation(async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(api.categories(), /backend is running/);
  await assert.rejects(api.create(input), /refresh history before retrying/);
});
