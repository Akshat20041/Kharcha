import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "./generated/prisma/client.js";
import { localDateTime } from "./transactions/domain.js";
import { timeZoneSchema } from "./time-zone.js";

export const dashboardQuery = z.strictObject({
  month: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM").optional(),
  time_zone: timeZoneSchema.optional(),
});

export function monthWindow(month: string, today: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const current = today.slice(0, 7);
  return { start, end, average_days: month > current ? 0 : month === current ? Number(today.slice(8, 10)) : end.getUTCDate() };
}

export function registerDashboard(app: FastifyInstance, db: PrismaClient, zone: string, clock: () => Date) {
  app.get("/dashboard", async (request, reply) => {
    const query = dashboardQuery.parse(request.query);
    const timeZone = query.time_zone ?? request.userTimeZone ?? zone;
    const today = localDateTime(clock(), timeZone).transaction_date;
    const month = query.month ?? today.slice(0, 7);
    const window = monthWindow(month, today);
    // Aggregate in PostgreSQL, with one consistent snapshot for totals and labels.
    const result = await db.$transaction(async (tx) => {
      const groups = await tx.transaction.groupBy({
        by: ["expense_nature", "category_id"],
        where: { user_id: request.userId, transaction_date: { gte: window.start, lte: window.end } },
        _sum: { total_amount: true, my_share: true, recoverable_amount: true }, _count: { _all: true },
      });
      const names = await tx.category.findMany({ select: { id: true, name: true } });
      let variable = new Prisma.Decimal(0), recurring = new Prisma.Decimal(0), paid = new Prisma.Decimal(0), recoverable = new Prisma.Decimal(0);
      let count = 0;
      const categories: { id: string; name: string; spending: string }[] = [];
      for (const group of groups) {
        const share = group._sum.my_share ?? new Prisma.Decimal(0);
        if (group.expense_nature === "variable") {
          variable = variable.plus(share);
          categories.push({ id: group.category_id, name: names.find((item) => item.id === group.category_id)?.name ?? "Unknown category", spending: share.toFixed(2) });
        } else recurring = recurring.plus(share);
        paid = paid.plus(group._sum.total_amount ?? 0);
        recoverable = recoverable.plus(group._sum.recoverable_amount ?? 0);
        count += group._count._all;
      }
      categories.sort((a, b) => new Prisma.Decimal(b.spending).comparedTo(a.spending) || a.name.localeCompare(b.name));
      return { transaction_count: count, variable_spending: variable.toFixed(2), recurring_spending: recurring.toFixed(2),
        effective_spending: variable.plus(recurring).toFixed(2), total_paid: paid.toFixed(2), recoverable: recoverable.toFixed(2),
        daily_variable_average: window.average_days ? variable.div(window.average_days).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2) : null, categories };
    }, { isolationLevel: "RepeatableRead" });
    reply.header("Cache-Control", "no-store");
    return { month, time_zone: timeZone, today, currency: "INR", average_days: window.average_days, ...result };
  });
}
