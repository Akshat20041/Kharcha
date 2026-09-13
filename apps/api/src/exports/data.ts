import { z } from "zod";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { ApiError } from "../transactions/domain.js";
import { serializeTransaction } from "../transactions/service.js";
import { requireUserId } from "../identity.js";

const date = z.iso.date().refine((value) => !value.startsWith("0000"));
export const exportQuery = z.strictObject({ start_date: date.optional(), end_date: date.optional() })
  .refine((input) => Boolean(input.start_date) === Boolean(input.end_date), "Supply both From and Through dates, or neither")
  .refine((input) => !input.start_date || input.start_date <= input.end_date!, "Through date must be on or after From date");
export type ExportQuery = z.infer<typeof exportQuery>;
export const EXPORT_LIMIT = 20000;
type Totals = { paid: Prisma.Decimal; personal: Prisma.Decimal; recoverable: Prisma.Decimal; variable: Prisma.Decimal; recurring: Prisma.Decimal; count: number };
const empty = (): Totals => ({ paid: new Prisma.Decimal(0), personal: new Prisma.Decimal(0), recoverable: new Prisma.Decimal(0), variable: new Prisma.Decimal(0), recurring: new Prisma.Decimal(0), count: 0 });
const serialize = (total: Totals) => ({ paid: total.paid.toFixed(2), personal: total.personal.toFixed(2), recoverable: total.recoverable.toFixed(2), variable: total.variable.toFixed(2), recurring: total.recurring.toFixed(2), count: total.count });

export async function exportData(db: PrismaClient, input: ExportQuery, now: Date, identity: string) {
  const user_id = requireUserId(identity);
  const rows = await db.transaction.findMany({
    where: { user_id, ...(input.start_date ? { transaction_date: { gte: new Date(`${input.start_date}T00:00:00Z`), lte: new Date(`${input.end_date}T00:00:00Z`) } } : {}) },
    include: { category: { select: { name: true } } },
    orderBy: [{ transaction_date: "asc" }, { transaction_time: "asc" }, { id: "asc" }], take: EXPORT_LIMIT + 1,
  });
  if (rows.length > EXPORT_LIMIT) throw new ApiError(400, "This export exceeds 20,000 transactions. Choose a smaller date range.");
  const totals = empty();
  const months = new Map<string, Totals>();
  const categories = new Map<string, { name: string; total: Totals }>();
  for (const row of rows) {
    if (row.currency !== "INR") throw new ApiError(400, "This export currently supports INR expenses only.");
    const month = row.transaction_date.toISOString().slice(0, 7);
    if (!months.has(month)) months.set(month, empty());
    if (!categories.has(row.category_id)) categories.set(row.category_id, { name: row.category.name, total: empty() });
    for (const total of [totals, months.get(month)!, categories.get(row.category_id)!.total]) {
      total.paid = total.paid.plus(row.total_amount); total.personal = total.personal.plus(row.my_share);
      total.recoverable = total.recoverable.plus(row.recoverable_amount);
      const nature = row.expense_nature === "variable" ? "variable" : "recurring";
      total[nature] = total[nature].plus(row.my_share); total.count++;
    }
  }
  // Excel only preserves 15 significant decimal digits; never silently round away paise.
  if (totals.paid.gt("9999999999999.99")) throw new ApiError(400, "This export exceeds Excel's exact currency range. Choose a smaller date range.");
  return { generated_at: now.toISOString(), start_date: input.start_date ?? rows[0]?.transaction_date.toISOString().slice(0, 10) ?? null,
    end_date: input.end_date ?? rows.at(-1)?.transaction_date.toISOString().slice(0, 10) ?? null,
    selection: input.start_date ? "Selected date range" : "All transactions", totals: serialize(totals),
    rows: rows.map(({ category, ...row }) => ({ ...serializeTransaction(row), category_name: category.name })),
    categories: [...categories.values()].sort((a, b) => b.total.personal.comparedTo(a.total.personal) || a.name.localeCompare(b.name))
      .map(({ name, total }) => ({ name, ...serialize(total), percentage: totals.personal.isZero() ? 0 : total.personal.div(totals.personal).toNumber() })),
    months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, ...serialize(total) })),
  };
}
export type ExportData = Awaited<ReturnType<typeof exportData>>;
