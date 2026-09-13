import "dotenv/config";
import assert from "node:assert/strict";
import { readConfig } from "../src/config.js";
import { groqProvider } from "../src/expense-parser/provider.js";
import { parseExpense } from "../src/expense-parser/service.js";
import { localDateTime } from "../src/transactions/domain.js";
import { resolveDate } from "../src/expense-parser/dates.js";

async function check() {
  const config = readConfig();
  if (!config.GROQ_API_KEY) { console.log("SKIPPED: set GROQ_API_KEY in apps/api/.env to run the live Groq check."); return; }
  const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${config.GROQ_API_KEY}` }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Groq model availability check failed. Check your credentials/account permissions.");
  const models = await response.json() as { data: { id: string }[] };
  if (!models.data.some((model) => model.id === config.GROQ_MODEL)) throw new Error("Configured GROQ_MODEL is not available to this account.");
  const provider = groqProvider(config);
  const now = new Date();
  const today = localDateTime(now, config.APP_TIMEZONE).transaction_date;
  const categories = [{ id: "sample-food", name: "Food & Dining" }, { id: "sample-groceries", name: "Groceries" },
    { id: "sample-transport", name: "Transport" }, { id: "sample-other", name: "Other" }];
  const parse = (text: string) => parseExpense(provider, text, categories, config.APP_TIMEZONE, now);
  const simple = await parse("450 dinner at Meghana");
  assert.equal(simple.draft.total_amount, "450.00");
  assert.equal(simple.draft.merchant?.toLowerCase(), "meghana");
  assert.equal(simple.draft.category_id, "sample-food");
  assert.equal(simple.draft.transaction_date, today);
  assert.ok(simple.draft.description);
  const split = await parse("1200 dinner yesterday split 4");
  assert.equal(split.draft.transaction_date, resolveDate("yesterday", today).value);
  assert.equal(split.draft.participant_count, 4);
  assert.equal(split.preview?.my_share, "300.00");
  assert.equal(split.preview?.recoverable_amount, "900.00");
  const missing = await parse("coffee at Starbucks");
  assert.equal(missing.draft.total_amount, null);
  assert.equal(missing.preview, null);
  const past = await parse("Paid 850 for groceries on Sep 5");
  assert.equal(past.draft.total_amount, "850.00");
  assert.equal(past.draft.transaction_date, `${today.slice(0, 4)}-09-05`);
  assert.equal(past.draft.category_id, "sample-groceries");
  const time = await parse("300 uber at 10:30 pm");
  assert.equal(time.draft.total_amount, "300.00");
  assert.equal(time.draft.transaction_time, "22:30:00");
  assert.equal(time.draft.category_id, "sample-transport");
  console.log("Live Groq checks passed: merchant/category, yesterday/equal split, missing amount, named date, and explicit time. No database writes performed.");
}
check().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Live check failed"); process.exitCode = 1; });
