import assert from "node:assert/strict";
import test from "node:test";
import { dashboardQuery, monthWindow } from "../src/dashboard.js";

test("dashboard months use elapsed days, leap years, and future-month semantics", () => {
  assert.equal(monthWindow("2026-09", "2026-09-09").average_days, 9);
  assert.equal(monthWindow("2024-02", "2026-09-09").average_days, 29);
  assert.equal(monthWindow("2026-10", "2026-09-09").average_days, 0);
  assert.equal(monthWindow("0001-02", "2026-09-09").end.toISOString().slice(0, 10), "0001-02-28");
  assert.equal(monthWindow("9999-12", "2026-09-09").end.toISOString().slice(0, 10), "9999-12-31");
  for (const month of ["0000-01", "2026-13", "2026-1", "2026-09-01"]) assert.throws(() => dashboardQuery.parse({ month }));
});
