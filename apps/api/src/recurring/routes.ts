import type { FastifyInstance } from "fastify";
import type { PrismaClient, RecurringExpense } from "../generated/prisma/client.js";
import { z } from "zod";
import { ApiError, idSchema, listSchema, localDateTime, transactionData } from "../transactions/domain.js";
import { asDate, createSchema, iso, nextOccurrence, ruleData, updateSchema } from "./domain.js";

function serialize(row: RecurringExpense) {
  return { ...row, total_amount: row.total_amount.toFixed(2), my_share: row.my_share.toFixed(2),
    start_date: iso(row.start_date), end_date: row.end_date ? iso(row.end_date) : null,
    next_due_date: iso(row.next_due_date), schedule_locked: row.next_due_date > row.start_date || !row.is_active && iso(row.next_due_date) === "9999-12-31" };
}

export function registerRecurringRoutes(app: FastifyInstance, db: PrismaClient, zone: string, clock: () => Date) {
  app.post("/recurring-expenses", async (request, reply) => {
    const input = createSchema.parse(request.body);
    const row = await db.recurringExpense.create({ data: { ...ruleData(input, request.userTimeZone || zone), user_id: request.userId, next_due_date: asDate(input.start_date) } });
    return reply.code(201).send(serialize(row));
  });
  app.get("/recurring-expenses", async (request) => {
    const { limit, offset } = listSchema.parse(request.query);
    const rows = await db.recurringExpense.findMany({ where: { user_id: request.userId }, take: limit, skip: offset,
      orderBy: [{ is_active: "desc" }, { next_due_date: "asc" }, { id: "asc" }] });
    return { data: rows.map(serialize), limit, offset };
  });
  app.patch("/recurring-expenses/:id", async (request) => {
    const { id } = idSchema.parse(request.params);
    const patch = updateSchema.parse(request.body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM recurring_expenses WHERE id = ${id}::uuid AND user_id = ${request.userId}::uuid FOR UPDATE`;
      const row = await tx.recurringExpense.findUnique({ where: { id, user_id: request.userId } });
      if (!row) throw new ApiError(404, "Recurring expense not found");
      const existing = serialize(row);
      if (existing.schedule_locked && ((patch.start_date && patch.start_date !== existing.start_date) ||
        (patch.frequency && patch.frequency !== row.frequency) || (patch.time_zone && patch.time_zone !== row.time_zone))) {
        throw new ApiError(400, "After generation, start date, frequency and timezone are fixed. Deactivate this rule and create a new schedule.");
      }
      const input = { ...existing, ...patch };
      if (patch.is_split === false && patch.participant_count === undefined) input.participant_count = null;
      return serialize(await tx.recurringExpense.update({ where: { id, user_id: request.userId }, data: {
        ...ruleData(input, zone), is_active: input.is_active,
        next_due_date: existing.schedule_locked ? row.next_due_date : asDate(input.start_date),
      } }));
    });
  });
  app.post("/recurring-expenses/:id/generate", async (request) => {
    const { id } = idSchema.parse(request.params);
    z.strictObject({}).parse(request.body ?? {});
    return db.$transaction(async (tx) => {
      // The rule lock serializes generation and edits; cursor and inserts commit together.
      await tx.$queryRaw`SELECT id FROM recurring_expenses WHERE id = ${id}::uuid AND user_id = ${request.userId}::uuid FOR UPDATE`;
      const row = await tx.recurringExpense.findUnique({ where: { id, user_id: request.userId } });
      if (!row) throw new ApiError(404, "Recurring expense not found");
      if (!row.is_active) throw new ApiError(409, "This recurring expense is inactive");
      const today = localDateTime(clock(), row.time_zone).transaction_date;
      const through = row.end_date && iso(row.end_date) < today ? iso(row.end_date) : today;
      let due = iso(row.next_due_date);
      let created = 0;
      let processed = 0;
      let active = true;
      while (due <= through && processed < 100) {
        const data = transactionData({ total_amount: row.total_amount.toFixed(2), description: row.name,
          category_id: row.category_id, notes: row.notes, is_split: row.is_split, participant_count: row.participant_count,
          transaction_date: due, transaction_time: "00:00:00", time_zone: row.time_zone }, zone, clock());
        const result = await tx.transaction.createMany({ data: [{ ...data, user_id: request.userId, expense_nature: "recurring_generated",
          recurring_expense_id: id, occurrence_date: asDate(due) }], skipDuplicates: true });
        created += result.count;
        processed++;
        const next = nextOccurrence(due, iso(row.start_date), row.frequency);
        if (!next) { active = false; break; }
        due = next;
      }
      const updated = await tx.recurringExpense.update({ where: { id, user_id: request.userId }, data: { next_due_date: asDate(due), is_active: active } });
      return { created, has_more: active && due <= through, rule: serialize(updated) };
    }, { timeout: 15000 });
  });
}
