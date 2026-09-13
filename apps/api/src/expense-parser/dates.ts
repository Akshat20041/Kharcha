import { z } from "zod";

const validDate = z.iso.date().refine((value) => !value.startsWith("0000"));
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthNames = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/;
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function resolveDate(expression: string | null, today: string): { value: string | null; warning?: string } {
  if (!expression) return { value: today };
  const text = expression.toLowerCase().trim().replace(/^on\s+/, "");
  const date = new Date(`${today}T00:00:00Z`);
  if (text === "today") return { value: today };
  if (text === "yesterday") {
    date.setUTCDate(date.getUTCDate() - 1);
    const value = date.toISOString().slice(0, 10);
    return validDate.safeParse(value).success ? { value } : { value: null, warning: "Choose a valid date." };
  }
  const weekday = /^last (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(text);
  if (weekday) {
    const days = (date.getUTCDay() - weekdays.indexOf(weekday[1]!) + 7) % 7 || 7;
    date.setUTCDate(date.getUTCDate() - days);
    const value = date.toISOString().slice(0, 10);
    return validDate.safeParse(value).success ? { value } : { value: null, warning: "Choose a valid date." };
  }
  if (validDate.safeParse(text).success) return { value: text };
  const named = /^(?:([a-z]+)\s+(\d{1,2})|(\d{1,2})\s+([a-z]+))(?:,?\s+(\d{4}))?$/.exec(text);
  if (named) {
    const name = named[1] ?? named[4]!;
    const month = monthNames.test(name) ? months.indexOf(name.slice(0, 3)) : -1;
    const day = named[2] ?? named[3]!;
    const year = named[5] ?? today.slice(0, 4);
    const value = `${year}-${String(month + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (month >= 0 && validDate.safeParse(value).success) return { value, ...(!named[5] ? { warning: `No year supplied; using ${year}. Check the date before saving.` } : {}) };
  }
  return { value: null, warning: "The date is unclear. Choose the transaction date before saving." };
}

export function resolveTime(expression: string | null, current: string): { value: string | null; warning?: string } {
  if (!expression) return { value: current };
  const text = expression.toLowerCase().trim().replace(/^at\s+/, "");
  const match = /^(\d{1,2})(?::([0-5]\d))?(?::([0-5]\d))?\s*(am|pm)?$/.exec(text);
  if (match) {
    let hour = Number(match[1]);
    if (match[4] && hour >= 1 && hour <= 12) hour = hour % 12 + (match[4] === "pm" ? 12 : 0);
    else if (match[4] || hour > 23 || !match[2]) return { value: null, warning: "The time is unclear. Choose a time before saving." };
    return { value: `${String(hour).padStart(2, "0")}:${match[2] ?? "00"}:${match[3] ?? "00"}` };
  }
  return { value: null, warning: "The time is unclear. Choose a time before saving." };
}
