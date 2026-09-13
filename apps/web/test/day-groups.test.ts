import assert from "node:assert/strict";
import test from "node:test";
import { groupByDay } from "../src/lib/day-groups";
import type { Transaction } from "../src/lib/types";

function row(id: string, date: string, time: string, paid: string, spent: string, recoverable: string): Transaction {
  return { id, transaction_date: date, transaction_time: time, total_amount: paid,
    my_share: spent, recoverable_amount: recoverable, currency: "INR", description: id,
    category_id: "food", time_zone: "Asia/Kolkata", notes: null, is_split: recoverable !== "0.00",
    participant_count: null, expense_nature: "variable" };
}

test("groups by actual date and time, with personal spending distinct from paid", () => {
  const data = [row("old", "2026-09-03", "23:00:00", "1234.00", "1234.00", "0.00"),
    row("early", "2026-09-08", "12:00:00", "2000.00", "1000.00", "1000.00"),
    row("late", "2026-09-08", "20:00:00", "2000.00", "2000.00", "0.00")];
  const groups = groupByDay(data);
  assert.deepEqual(groups.map((day) => day.date), ["2026-09-08", "2026-09-03"]);
  assert.deepEqual(groups[0]!.transactions.map((item) => item.id), ["late", "early"]);
  assert.deepEqual(groups[0]!.totals, [{ currency: "INR", spent: "3000.00", paid: "4000.00", recoverable: "1000.00" }]);
  assert.deepEqual(groups[1]!.totals, [{ currency: "INR", spent: "1234.00", paid: "1234.00", recoverable: "0.00" }]);
  assert.equal(data[0]!.id, "old");
});

test("sums decimal strings exactly and keeps currencies separate", () => {
  const data = [row("a", "2026-09-08", "12:00:00", "999999999999.99", "0.10", "999999999999.89"),
    row("b", "2026-09-08", "12:00:00", "0.20", "0.20", "0.00")];
  const totals = groupByDay(data)[0]!.totals[0]!;
  assert.equal(totals.spent, "0.30");
  assert.equal(totals.paid, "1000000000000.19");
  assert.equal(groupByDay([...data, { ...data[1]!, id: "c", currency: "USD" }])[0]!.totals.length, 2);
});

test("a day spanning pages includes only rows in each page", () => {
  const data = Array.from({ length: 21 }, (_, i) => row(String(i), "2026-09-08", "12:00:00", "1.00", "1.00", "0.00"));
  assert.equal(groupByDay(data.slice(0, 20))[0]!.totals[0]!.spent, "20.00");
  assert.equal(groupByDay(data.slice(20))[0]!.totals[0]!.spent, "1.00");
  assert.deepEqual(groupByDay([]), []);
});
