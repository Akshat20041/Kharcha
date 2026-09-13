ALTER TABLE "users"
  ADD COLUMN "display_name" VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN "time_zone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE "users" ADD CONSTRAINT "users_currency_inr" CHECK (currency = 'INR');

-- Keep checks immediate for normal writes, but permit the explicit admin-only
-- local-data transfer to update both sides together in one transaction.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_recurring_expense_id_user_id_fkey";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_expense_id_user_id_fkey"
  FOREIGN KEY ("recurring_expense_id", "user_id") REFERENCES "recurring_expenses"("id", "user_id")
  ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
