import assert from "node:assert/strict";
import test from "node:test";
import { exportData, exportQuery } from "../src/exports/data.js";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client.js";
import { LOCAL_USER_ID } from "../src/identity.js";

test("export ranges require complete ordered dates", () => {
  assert.ok(exportQuery.safeParse({}).success);
  for (const input of [{ start_date: "2026-09-01" }, { start_date: "2026-09-02", end_date: "2026-09-01" },
    { start_date: "2026-02-30", end_date: "2026-03-01" }, { start_date: "0000-01-01", end_date: "2026-09-01" }]) {
    assert.equal(exportQuery.safeParse(input).success, false);
  }
});

test("export is zero-safe and rejects silent truncation or Excel precision loss", async () => {
  const db = (rows: unknown[]) => ({ transaction: { findMany: async () => rows } }) as unknown as PrismaClient;
  const empty = await exportData(db([]), {}, new Date(), LOCAL_USER_ID);
  assert.equal(empty.totals.personal, "0.00"); assert.equal(empty.start_date, null);
  assert.deepEqual(empty.categories, []); assert.deepEqual(empty.months, []);
  await assert.rejects(exportData(db(Array(20001).fill({})), {}, new Date(), LOCAL_USER_ID), /20,000/);
  const row = { currency: "INR", category_id: "food", category: { name: "Food" }, transaction_date: new Date("2026-09-01"),
    total_amount: new Prisma.Decimal("999999999999.99"), my_share: new Prisma.Decimal("999999999999.99"),
    recoverable_amount: new Prisma.Decimal(0), expense_nature: "variable" };
  await assert.rejects(exportData(db(Array(11).fill(row)), {}, new Date(), LOCAL_USER_ID), /exact currency range/);
});
