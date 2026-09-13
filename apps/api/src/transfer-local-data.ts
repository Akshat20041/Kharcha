import type { PrismaClient } from "./generated/prisma/client.js";
import { LOCAL_USER_ID, requireUserId } from "./identity.js";

// Administrator operation only. Never register this as a browser-accessible route.
export async function transferLocalData(db: PrismaClient, target: string, confirm = false) {
  const user_id = requireUserId(target);
  if (user_id === LOCAL_USER_ID) throw new Error("Choose a signed-in Supabase account, not the local identity.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE users, transactions, recurring_expenses, groq_api_usage IN SHARE ROW EXCLUSIVE MODE`;
    if (!await tx.user.findUnique({ where: { id: user_id } })) throw new Error("Target account not found. Sign in to KharCha first and copy its Account ID from Settings.");
    const counts = {
      transactions: await tx.transaction.count({ where: { user_id: LOCAL_USER_ID } }),
      recurring_expenses: await tx.recurringExpense.count({ where: { user_id: LOCAL_USER_ID } }),
      groq_api_usage: await tx.groqApiUsage.count({ where: { user_id: LOCAL_USER_ID } }),
    };
    if (confirm) {
      await tx.$executeRaw`SET CONSTRAINTS transactions_recurring_expense_id_user_id_fkey DEFERRED`;
      // SQL preserves the existing updated_at timestamps as well as all values.
      await tx.$executeRaw`UPDATE transactions SET user_id = ${user_id}::uuid WHERE user_id = ${LOCAL_USER_ID}::uuid`;
      await tx.$executeRaw`UPDATE recurring_expenses SET user_id = ${user_id}::uuid WHERE user_id = ${LOCAL_USER_ID}::uuid`;
      await tx.$executeRaw`UPDATE groq_api_usage SET user_id = ${user_id}::uuid WHERE user_id = ${LOCAL_USER_ID}::uuid`;
    }
    return { target: user_id, applied: confirm, ...counts };
  }, { timeout: 30000 });
}
