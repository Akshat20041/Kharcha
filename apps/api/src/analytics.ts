import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "./generated/prisma/client.js";
import { dashboardQuery, monthWindow } from "./dashboard.js";
import { localDateTime } from "./transactions/domain.js";
import { timeZoneSchema } from "./time-zone.js";
import { requireUserId } from "./identity.js";

const dateSchema = z.iso.date().refine((value) => !value.startsWith("0000"));
const dayMs = 86400000;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const decimal = (value: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(value ?? 0);
const fixed = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
export const rangeQuery = z.strictObject({ start_date: dateSchema, end_date: dateSchema, time_zone: timeZoneSchema.optional() })
  .refine((input) => input.end_date >= input.start_date && (date(input.end_date).valueOf() - date(input.start_date).valueOf()) / dayMs < 366,
    "Choose an ordered date range of at most 366 days");

async function aggregate(tx: Prisma.TransactionClient, start: Date, end: Date, today: string, user_id: string) {
  const [groups, categories] = await Promise.all([
    tx.transaction.groupBy({ by: ["transaction_date", "expense_nature", "category_id"],
      where: { user_id, transaction_date: { gte: start, lte: end } },
      _sum: { total_amount: true, my_share: true, recoverable_amount: true }, _count: { _all: true } }),
    tx.category.findMany({ select: { id: true, name: true } }),
  ]);
  let variable = decimal(0), recurring = decimal(0), paid = decimal(0), recoverable = decimal(0), count = 0;
  const categoryTotals = new Map<string, Prisma.Decimal>();
  const daily = new Map<string, Prisma.Decimal>();
  for (const group of groups) {
    const share = decimal(group._sum.my_share);
    if (group.expense_nature === "variable") variable = variable.plus(share); else recurring = recurring.plus(share);
    paid = paid.plus(decimal(group._sum.total_amount)); recoverable = recoverable.plus(decimal(group._sum.recoverable_amount));
    count += group._count._all;
    categoryTotals.set(group.category_id, decimal(categoryTotals.get(group.category_id)).plus(share));
    const key = iso(group.transaction_date);
    daily.set(key, decimal(daily.get(key)).plus(share));
  }
  const personal = variable.plus(recurring);
  const elapsedEnd = Math.min(end.valueOf(), date(today).valueOf());
  const averageDays = Math.max(0, Math.floor((elapsedEnd - start.valueOf()) / dayMs) + 1);
  const dailySeries = [];
  for (let cursor = start.valueOf(); cursor <= end.valueOf(); cursor += dayMs) {
    const key = iso(new Date(cursor));
    dailySeries.push({ date: key, spending: fixed(decimal(daily.get(key))) });
  }
  return { start_date: iso(start), end_date: iso(end), transaction_count: count,
    variable_spending: fixed(variable), recurring_spending: fixed(recurring), effective_spending: fixed(personal),
    total_paid: fixed(paid), recoverable: fixed(recoverable), average_days: averageDays,
    daily_variable_average: averageDays ? fixed(variable.div(averageDays)) : null,
    categories: [...categoryTotals].map(([id, spending]) => ({ id, name: categories.find((item) => item.id === id)?.name ?? "Unknown category",
      spending: fixed(spending), percentage: personal.isZero() ? "0.00" : fixed(spending.div(personal).mul(100)) }))
      .sort((a, b) => decimal(b.spending).comparedTo(a.spending) || a.name.localeCompare(b.name)), daily_series: dailySeries };
}

export async function analyticsPeriod(db: PrismaClient, start: Date, end: Date, today: string, previous: { start: Date; end: Date } | null, identity: string) {
  const user_id = requireUserId(identity);
  return db.$transaction(async (tx) => {
    const current = await aggregate(tx, start, end, today, user_id);
    const prior = previous ? await tx.transaction.aggregate({ where: { user_id, transaction_date: { gte: previous.start, lte: previous.end } }, _sum: { my_share: true } }) : null;
    const previousSpending = decimal(prior?._sum.my_share);
    const change = decimal(current.effective_spending).minus(previousSpending);
    return { ...current, comparison: previous ? { start_date: iso(previous.start), end_date: iso(previous.end),
      personal_spending: fixed(previousSpending), change_amount: fixed(change),
      change_percentage: previousSpending.isZero() ? null : fixed(change.div(previousSpending).mul(100)),
      direction: change.isZero() ? "same" : change.gt(0) ? "higher" : "lower" } : null };
  }, { isolationLevel: "RepeatableRead" });
}

export function registerAnalytics(app: FastifyInstance, db: PrismaClient, zone: string, clock: () => Date) {
  app.get("/analytics/monthly", async (request, reply) => {
    const input = dashboardQuery.parse(request.query);
    const timeZone = input.time_zone ?? request.userTimeZone ?? zone;
    const today = localDateTime(clock(), timeZone).transaction_date;
    const month = input.month ?? today.slice(0, 7);
    const window = monthWindow(month, today);
    const previousEnd = new Date(window.start.valueOf() - dayMs);
    const previousStart = new Date(previousEnd); previousStart.setUTCDate(1);
    const previous = previousStart.getUTCFullYear() >= 1 ? { start: previousStart, end: previousEnd } : null;
    const result = await analyticsPeriod(db, window.start, window.end, today, previous, request.userId);
    reply.header("Cache-Control", "no-store");
    return { month, today, time_zone: timeZone, currency: "INR", ...result };
  });
  app.get("/analytics/range", async (request, reply) => {
    const input = rangeQuery.parse(request.query);
    const timeZone = input.time_zone ?? request.userTimeZone ?? zone;
    const today = localDateTime(clock(), timeZone).transaction_date;
    const start = date(input.start_date), end = date(input.end_date);
    const priorEnd = new Date(start.valueOf() - dayMs);
    const priorStart = new Date(start.valueOf() - (end.valueOf() - start.valueOf() + dayMs));
    const result = await analyticsPeriod(db, start, end, today, priorStart.getUTCFullYear() >= 1 ? { start: priorStart, end: priorEnd } : null, request.userId);
    reply.header("Cache-Control", "no-store");
    return { today, time_zone: timeZone, currency: "INR", ...result };
  });
}
