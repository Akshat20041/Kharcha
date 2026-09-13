import { z } from "zod";
import { ApiError, calculateAmounts, createSchema as transactionSchema } from "../transactions/domain.js";
import { timeZoneSchema } from "../time-zone.js";

const date = z.iso.date().refine((value) => !value.startsWith("0000"), "Year must be at least 0001");
export const createSchema = z.strictObject({
  name: z.string().trim().min(1).max(200), category_id: z.uuid(),
  total_amount: transactionSchema.shape.total_amount,
  frequency: z.enum(["monthly", "weekly", "yearly"]), start_date: date,
  end_date: date.nullable().optional(), time_zone: timeZoneSchema.optional(),
  is_split: z.boolean().optional(), participant_count: z.number().int().min(2).max(2147483647).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
export const updateSchema = createSchema.partial().extend({ is_active: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "Provide an editable field");

export const iso = (value: Date) => value.toISOString().slice(0, 10);
export const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function ruleData(input: z.infer<typeof createSchema>, zone: string) {
  if (input.end_date && input.end_date < input.start_date) throw new ApiError(400, "End date must be on or after start date");
  const split = input.is_split ?? false;
  if (!split && input.participant_count != null) throw new ApiError(400, "Non-split expenses cannot have participants");
  const participants = split ? input.participant_count ?? null : null;
  const amounts = calculateAmounts(input.total_amount, split, participants);
  return { name: input.name, category_id: input.category_id,
    total_amount: amounts.total_amount, my_share: amounts.my_share, currency: "INR",
    frequency: input.frequency, start_date: asDate(input.start_date),
    end_date: input.end_date ? asDate(input.end_date) : null, time_zone: input.time_zone ?? zone,
    is_split: split, participant_count: participants, notes: input.notes ?? null };
}

// Retain the original day/month anchor after short months and leap years.
export function nextOccurrence(current: string, anchor: string, frequency: "monthly" | "weekly" | "yearly") {
  const next = asDate(current);
  const start = asDate(anchor);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else {
    next.setUTCDate(1);
    if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
    else { next.setUTCFullYear(next.getUTCFullYear() + 1); next.setUTCMonth(start.getUTCMonth()); }
    const last = new Date(next);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    next.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
  }
  return next.getUTCFullYear() > 9999 ? null : iso(next);
}
