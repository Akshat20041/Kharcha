import assert from "node:assert/strict";
import test from "node:test";
import { calculateAmounts, createSchema, localDateTime, transactionData } from "../src/transactions/domain.js";
import { readConfig } from "../src/config.js";

test("PRD money examples and rounding use exact decimal arithmetic", () => {
  for (const [total, split, participants, share, recoverable] of [
    ["500", false, null, "500.00", "0.00"],
    ["1200", true, 4, "300.00", "900.00"],
    ["1000", true, 3, "333.33", "666.67"],
    ["0.01", true, 2, "0.01", "0.00"],
    ["0.03", true, 2, "0.02", "0.01"],
    ["999999999999.99", true, 3, "333333333333.33", "666666666666.66"],
  ] as const) {
    const result = calculateAmounts(total, split, participants);
    assert.equal(result.my_share, share);
    assert.equal(result.recoverable_amount, recoverable);
  }
});

test("invalid financial inputs are rejected", () => {
  for (const amount of ["0", "-1", "0.001", "NaN", "Infinity", "1000000000000"]) {
    assert.throws(() => calculateAmounts(amount, false, null));
  }
  for (const participants of [null, 0, 1, 1.5, 2147483648]) {
    assert.throws(() => calculateAmounts("500", true, participants));
  }
});

test("API rejects invalid dates, times, money formats, and client calculated values", () => {
  const base = { total_amount: "500", description: "Dinner", category_id: "00000000-0000-4000-8000-000000000001" };
  for (const field of [
    { total_amount: 500 }, { total_amount: "abc" }, { total_amount: "1e3" }, { total_amount: "1.001" },
    { total_amount: "0" }, { description: "  " }, { my_share: "1.00" }, { recoverable_amount: "1.00" },
    { transaction_date: "2026-02-29" }, { transaction_date: "2026-04-31" }, { transaction_date: "0000-01-01" },
    { transaction_time: "24:00" }, { transaction_time: "12:60" }, { transaction_time: "12:30Z" },
    { time_zone: "Not/AZone" }, { time_zone: "+05:30" }, { transaction_type: "income" },
    { currency: "USD" }, { participant_count: "4" }, { participant_count: 1 }, { is_split: "true" },
    { split_type: "custom" }, { category_id: "not-a-uuid" }, { recurring_expense_id: base.category_id },
  ]) assert.equal(createSchema.safeParse({ ...base, ...field }).success, false, JSON.stringify(field));
  assert.equal(createSchema.safeParse({ ...base, transaction_date: "2024-02-29" }).success, true);
});

test("local defaults respect timezone day and year boundaries and DST", () => {
  assert.deepEqual(localDateTime(new Date("2026-09-08T20:00:00Z"), "Asia/Kolkata"), {
    transaction_date: "2026-09-09", transaction_time: "01:30:00",
  });
  assert.deepEqual(localDateTime(new Date("2027-01-01T01:00:00Z"), "America/Los_Angeles"), {
    transaction_date: "2026-12-31", transaction_time: "17:00:00",
  });
  assert.equal(localDateTime(new Date("2026-03-08T07:00:00Z"), "America/New_York").transaction_time, "03:00:00");
});

test("explicit past dates and times stay independent of entry time", () => {
  const row = transactionData({ total_amount: "500", description: "Dinner",
    category_id: "00000000-0000-4000-8000-000000000001",
    transaction_date: "2026-09-05", transaction_time: "20:30",
  }, "Asia/Kolkata", new Date("2026-09-08T20:00:00Z"));
  assert.equal(row.transaction_date.toISOString(), "2026-09-05T00:00:00.000Z");
  assert.equal(row.transaction_time.toISOString(), "1970-01-01T20:30:00.000Z");
});

test("application timezone is configurable and invalid values fail startup", () => {
  const env = { DATABASE_URL: "postgresql://localhost/kharcha" };
  assert.equal(readConfig({ ...env, APP_TIMEZONE: "Asia/Kolkata" }).APP_TIMEZONE, "Asia/Kolkata");
  assert.equal(readConfig(env).APP_TIMEZONE, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.throws(() => readConfig({ ...env, APP_TIMEZONE: "bad" }), /APP_TIMEZONE/);
});
