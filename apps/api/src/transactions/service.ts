import type { z } from "zod";
import type { PrismaClient, Transaction } from "../generated/prisma/client.js";
import { ApiError, transactionData, type createSchema, type updateSchema } from "./domain.js";
import { requireUserId } from "../identity.js";

export function serializeTransaction(transaction: Transaction) {
  return {
    ...transaction,
    total_amount: transaction.total_amount.toFixed(2),
    my_share: transaction.my_share.toFixed(2),
    recoverable_amount: transaction.recoverable_amount.toFixed(2),
    transaction_date: transaction.transaction_date.toISOString().slice(0, 10),
    transaction_time: transaction.transaction_time.toISOString().slice(11, 19),
    occurrence_date: transaction.occurrence_date?.toISOString().slice(0, 10) ?? null,
    created_at: transaction.created_at.toISOString(),
    updated_at: transaction.updated_at.toISOString(),
  };
}

export function transactionService(db: PrismaClient, timeZone: string, clock: () => Date, identity: string) {
  const user_id = requireUserId(identity);
  return {
    async create(input: z.infer<typeof createSchema>) {
      return serializeTransaction(await db.transaction.create({ data: { ...transactionData(input, timeZone, clock()), user_id } }));
    },

    async list(limit: number, offset: number) {
      const rows = await db.transaction.findMany({
        where: { user_id },
        orderBy: [{ transaction_date: "desc" }, { transaction_time: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      });
      return { data: rows.map(serializeTransaction), limit, offset };
    },

    async get(id: string) {
      const row = await db.transaction.findUnique({ where: { id, user_id } });
      if (!row) throw new ApiError(404, "Transaction not found");
      return serializeTransaction(row);
    },

    async update(id: string, patch: z.infer<typeof updateSchema>) {
      return db.$transaction(async (tx) => {
        // Lock before reading so concurrent partial updates cannot overwrite one another.
        await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${id}::uuid AND user_id = ${user_id}::uuid FOR UPDATE`;
        const row = await tx.transaction.findUnique({ where: { id, user_id } });
        if (!row) throw new ApiError(404, "Transaction not found");
        const existing = serializeTransaction(row);
        const input: z.infer<typeof createSchema> = {
          total_amount: existing.total_amount,
          description: row.description,
          category_id: row.category_id,
          merchant: row.merchant,
          subcategory: row.subcategory,
          notes: row.notes,
          currency: "INR",
          transaction_date: existing.transaction_date,
          transaction_time: existing.transaction_time,
          time_zone: row.time_zone,
          payment_method: row.payment_method,
          is_split: row.is_split,
          participant_count: row.participant_count,
          split_type: row.split_type,
          ...patch,
        };
        if (patch.is_split === false) {
          if (patch.participant_count != null || patch.split_type != null) {
            throw new ApiError(400, "Non-split expenses cannot have participants or split_type");
          }
          input.participant_count = null;
          input.split_type = null;
        }
        // Occurrence identity and recurring rule remain untouched when editing history.
        return serializeTransaction(await tx.transaction.update({
          where: { id, user_id }, data: transactionData(input, timeZone, clock()),
        }));
      });
    },

    async delete(id: string) {
      await db.transaction.delete({ where: { id, user_id } });
    },
  };
}
