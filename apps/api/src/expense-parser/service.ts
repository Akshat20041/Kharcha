import { ApiError, calculateAmounts, createSchema, localDateTime } from "../transactions/domain.js";
import { extractionSchema } from "./schema.js";
import { resolveDate, resolveTime } from "./dates.js";
import type { ExpenseProvider } from "./provider.js";

export async function parseExpense(provider: ExpenseProvider, text: string, categories: { id: string; name: string }[], zone: string, now: Date) {
  let raw: unknown;
  try { raw = await provider.extract(text, categories.map((category) => category.name)); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, "Quick entry is unavailable. Retry or use Add Expense."); }
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(502, "Quick entry returned an invalid result. Retry or enter the expense manually.");
  const extracted = parsed.data;
  const warnings: string[] = [];
  const local = localDateTime(now, zone);
  const grounded = (value: string | null) => value !== null && text.toLowerCase().includes(value.toLowerCase());
  const normalize = (value: string) => value.replace(/(?:₹|inr|rs\.?|,|\s)/gi, "").replace(/^0+(?=\d)/, "").replace(/^\./, "0.");
  let amount: string | null = null;
  // Require amount evidence in the input; no inference from category or merchant.
  if (extracted.amount && extracted.amount_source && grounded(extracted.amount_source)) {
    const value = normalize(extracted.amount);
    const source = normalize(extracted.amount_source);
    const completeNumber = (text.match(/(?:\d+(?:,\d+)*(?:\.\d+)?|\.\d+)/g) ?? []).some((token) => normalize(token) === source);
    if (createSchema.shape.total_amount.safeParse(value).success && createSchema.shape.total_amount.safeParse(source).success &&
      completeNumber && calculateAmounts(value, false, null).total_amount === calculateAmounts(source, false, null).total_amount) amount = calculateAmounts(value, false, null).total_amount;
  }
  if (!amount) warnings.push("No reliable amount found. Enter the amount before saving.");
  const category = extracted.category_confidence >= 0.6 ? categories.find((item) => item.name.toLowerCase() === extracted.category?.toLowerCase()) : undefined;
  const selected = category ?? categories.find((item) => item.name === "Other");
  if (!category) warnings.push("Category is uncertain. Review the suggested category.");
  const date = extracted.date_expression && !grounded(extracted.date_expression)
    ? { value: null, warning: "The suggested date wasn't in your message. Choose a date." }
    : resolveDate(extracted.date_expression, local.transaction_date);
  const time = extracted.time_expression && !grounded(extracted.time_expression)
    ? { value: null, warning: "The suggested time wasn't in your message. Choose a time." }
    : resolveTime(extracted.time_expression, local.transaction_time);
  if (date.warning) warnings.push(date.warning);
  if (time.warning) warnings.push(time.warning);
  const split = extracted.is_split || /\bsplit\b/i.test(text);
  const participants = split ? extracted.participant_count : null;
  if (split && participants === null) warnings.push("Split size is unclear. Enter the total number of people, including you.");
  const description = grounded(extracted.description) ? extracted.description! : "";
  if (!description) warnings.push("Add or review the expense description.");
  const draft = { total_amount: amount, description, merchant: grounded(extracted.merchant) ? extracted.merchant : null,
    category_id: selected?.id ?? "", transaction_date: date.value, transaction_time: time.value, time_zone: zone,
    is_split: split, participant_count: participants, notes: grounded(extracted.notes) ? extracted.notes : null };
  return { draft, category_name: selected?.name ?? null, warnings,
    confidence: { category: category ? extracted.category_confidence : 0 },
    preview: amount && (!split || participants !== null) ? calculateAmounts(amount, split, participants) : null };
}
