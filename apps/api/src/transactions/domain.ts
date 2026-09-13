import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";

import { timeZoneSchema } from "../time-zone.js";

const dateSchema = z.iso.date().refine((value) => !value.startsWith("0000"), "Year must be at least 0001");
const amountSchema = z.string().max(15).regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/,
  "Use a positive decimal string with at most 12 integer digits and 2 decimal places")
  .refine((value) => /[1-9]/.test(value), "Amount must be greater than zero");

const fields = {
  total_amount: amountSchema,
  description: z.string().trim().min(1).max(500),
  category_id: z.uuid(),
  merchant: z.string().trim().max(200).nullable().optional(),
  subcategory: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  currency: z.literal("INR").optional(),
  transaction_date: dateSchema.optional(),
  transaction_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    "Use HH:mm or HH:mm:ss").optional(),
  time_zone: timeZoneSchema.optional(),
  is_split: z.boolean().optional(),
  participant_count: z.number().int().min(2).max(2147483647).nullable().optional(),
  split_type: z.literal("equal").nullable().optional(),
  payment_method: z.enum(["UPI", "CreditCard", "DebitCard", "Cash", "BankTransfer", "Wallet", "Other"]).nullable().optional(),
};

export const createSchema = z.strictObject(fields);
export const updateSchema = z.strictObject(fields).partial().refine((value) => Object.keys(value).length > 0,
  "Provide at least one editable field");
export const idSchema = z.strictObject({ id: z.uuid() });
export const listSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(2147483647).default(0),
});
export const deleteSchema = z.strictObject({ confirm: z.literal("true") });

export class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export function calculateAmounts(total: string, isSplit: boolean, participants: number | null) {
  const amount = new Prisma.Decimal(total);
  if (!amount.isFinite() || amount.lte(0) || amount.gt("999999999999.99") || amount.decimalPlaces() > 2) {
    throw new ApiError(400, "Invalid total_amount");
  }
  if (isSplit && (participants === null || !Number.isInteger(participants) || participants < 2 || participants > 2147483647)) {
    throw new ApiError(400, "Split expenses require participant_count of at least 2");
  }
  const share = isSplit
    ? amount.dividedBy(participants!).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : amount;
  return {
    total_amount: amount.toFixed(2),
    my_share: share.toFixed(2),
    recoverable_amount: amount.minus(share).toFixed(2),
  };
}

export function localDateTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
  return {
    transaction_date: `${part("year")}-${part("month")}-${part("day")}`,
    transaction_time: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}

export function transactionData(input: z.infer<typeof createSchema>, timeZone: string, now: Date) {
  const zone = input.time_zone ?? timeZone;
  const local = localDateTime(now, zone);
  const isSplit = input.is_split ?? false;
  if (!isSplit && (input.participant_count != null || input.split_type != null)) {
    throw new ApiError(400, "Non-split expenses cannot have participants or split_type");
  }
  const participants = isSplit ? input.participant_count ?? null : null;
  const time = input.transaction_time ?? local.transaction_time;
  return {
    ...calculateAmounts(input.total_amount, isSplit, participants),
    description: input.description,
    category_id: input.category_id,
    merchant: input.merchant ?? null,
    subcategory: input.subcategory ?? null,
    notes: input.notes ?? null,
    currency: input.currency ?? "INR",
    payment_method: input.payment_method ?? null,
    transaction_date: new Date(`${input.transaction_date ?? local.transaction_date}T00:00:00.000Z`),
    transaction_time: new Date(`1970-01-01T${time.length === 5 ? `${time}:00` : time}.000Z`),
    time_zone: zone,
    is_split: isSplit,
    participant_count: participants,
    split_type: isSplit ? "equal" as const : null,
  };
}
