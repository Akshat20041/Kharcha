import type { ExpenseInput, Transaction } from "./types";
import { preferredTimeZone } from "./preferences";

export type ExpenseDraft = Omit<ExpenseInput, "participant_count" | "notes"> & { participant_count: string; notes: string };

export function newDraft(now = new Date()): ExpenseDraft {
  const zone = preferredTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return {
    total_amount: "", description: "", category_id: "", merchant: "", notes: "", is_split: false, participant_count: "2",
    transaction_date: `${part("year")}-${part("month")}-${part("day")}`,
    transaction_time: `${part("hour")}:${part("minute")}:${part("second")}`,
    time_zone: zone,
  };
}

export function editDraft(row: Transaction): ExpenseDraft {
  return {
    total_amount: row.total_amount, description: row.description, category_id: row.category_id,
    transaction_date: row.transaction_date, transaction_time: row.transaction_time, time_zone: row.time_zone,
    notes: row.notes ?? "", is_split: row.is_split, participant_count: String(row.participant_count ?? 2),
    merchant: row.merchant ?? "",
  };
}

export function prepareExpense(draft: ExpenseDraft): { errors: Record<string, string>; input: ExpenseInput } {
  const errors: Record<string, string> = {};
  let amount = draft.total_amount.trim().replace(/^0+(?=\d)/, "");
  if (amount.startsWith(".")) amount = `0${amount}`;
  if (!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount)) {
    errors.total_amount = "Enter an amount above zero, with up to 2 decimal places (maximum 999999999999.99).";
  }
  if (!draft.description.trim()) errors.description = "Add a short description.";
  if (draft.description.trim().length > 500) errors.description = "Keep the description under 500 characters.";
  if (!draft.category_id) errors.category_id = "Choose a category.";
  const date = new Date(`${draft.transaction_date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.transaction_date) || draft.transaction_date.startsWith("0000") ||
    Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== draft.transaction_date) errors.transaction_date = "Choose a valid date.";
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(draft.transaction_time)) errors.transaction_time = "Choose a valid time.";
  const count = Number(draft.participant_count);
  if (draft.is_split && (!/^\d+$/.test(draft.participant_count) || !Number.isInteger(count) || count < 2 || count > 2147483647)) {
    errors.participant_count = "Enter at least 2 people, including you (maximum 2147483647).";
  }
  if (draft.notes.length > 5000) errors.notes = "Keep notes under 5,000 characters.";
  if ((draft.merchant?.length ?? 0) > 200) errors.merchant = "Keep the merchant under 200 characters.";
  return { errors, input: {
    total_amount: amount, description: draft.description.trim(), category_id: draft.category_id,
    transaction_date: draft.transaction_date, transaction_time: draft.transaction_time, time_zone: draft.time_zone,
    notes: draft.notes.trim() || null, is_split: draft.is_split, participant_count: draft.is_split ? count : null,
    merchant: draft.merchant?.trim() || null,
  } };
}

// Presentation only: format decimal strings without converting money to a float.
export function money(amount: string, currency = "INR") {
  const [whole = "0", fraction = "00"] = amount.split(".");
  return `${currency === "INR" ? "₹" : `${currency} `}${BigInt(whole).toLocaleString("en-IN")}.${fraction.padEnd(2, "0")}`;
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
export function displayTime(value: string) {
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12}:${value.slice(3, 5)} ${hour >= 12 ? "pm" : "am"}`;
}
export function newestFirst(rows: Transaction[]) {
  return [...rows].sort((a, b) => {
    const left = `${a.transaction_date} ${a.transaction_time} ${a.id}`;
    const right = `${b.transaction_date} ${b.transaction_time} ${b.id}`;
    return left < right ? 1 : left > right ? -1 : 0;
  });
}
