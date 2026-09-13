import assert from "node:assert/strict";
import test from "node:test";
import { nextOccurrence, ruleData, createSchema } from "../src/recurring/domain.js";

test("monthly and yearly schedules retain their original anchor", () => {
  assert.equal(nextOccurrence("2026-01-31", "2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", "2026-01-31", "monthly"), "2026-03-31");
  assert.equal(nextOccurrence("2024-02-29", "2024-02-29", "yearly"), "2025-02-28");
  assert.equal(nextOccurrence("2027-02-28", "2024-02-29", "yearly"), "2028-02-29");
  assert.equal(nextOccurrence("2026-12-31", "2026-12-31", "weekly"), "2027-01-07");
  assert.equal(nextOccurrence("9999-12-31", "9999-12-31", "monthly"), null);
});

test("recurring validation uses existing exact-money rules", () => {
  const input = { name: "WiFi", category_id: "00000000-0000-4000-8000-000000000001", total_amount: "1000",
    frequency: "monthly" as const, start_date: "2026-09-01", is_split: true, participant_count: 3 };
  assert.equal(ruleData(createSchema.parse(input), "Asia/Kolkata").my_share, "333.33");
  assert.throws(() => ruleData({ ...input, end_date: "2026-08-31" }, "Asia/Kolkata"));
  assert.throws(() => ruleData({ ...input, participant_count: null }, "Asia/Kolkata"));
  assert.throws(() => createSchema.parse({ ...input, my_share: "1" }));
  assert.throws(() => createSchema.parse({ ...input, start_date: "2026-02-30" }));
});
