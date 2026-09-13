BEGIN;

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- One explicit local identity owns all pre-authentication data. Preserve every
-- financial value, timestamp, record ID, occurrence and usage record.
INSERT INTO "users" ("id") VALUES ('00000000-0000-4000-8000-000000000001');
ALTER TABLE "transactions" ADD COLUMN "user_id" UUID;
ALTER TABLE "recurring_expenses" ADD COLUMN "user_id" UUID;
ALTER TABLE "groq_api_usage" ADD COLUMN "user_id" UUID;
UPDATE "transactions" SET "user_id" = '00000000-0000-4000-8000-000000000001';
UPDATE "recurring_expenses" SET "user_id" = '00000000-0000-4000-8000-000000000001';
UPDATE "groq_api_usage" SET "user_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "recurring_expenses" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "groq_api_usage" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "groq_api_usage" ADD CONSTRAINT "groq_api_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "recurring_expenses_id_user_id_key" ON "recurring_expenses"("id", "user_id");
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_recurring_expense_id_fkey";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_expense_id_user_id_fkey" FOREIGN KEY ("recurring_expense_id", "user_id") REFERENCES "recurring_expenses"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

DROP INDEX "transactions_transaction_date_transaction_time_id_idx";
CREATE INDEX "transactions_user_id_transaction_date_transaction_time_id_idx" ON "transactions"("user_id", "transaction_date" DESC, "transaction_time" DESC, "id" DESC);
DROP INDEX "recurring_expenses_is_active_next_due_date_idx";
CREATE INDEX "recurring_expenses_user_id_is_active_next_due_date_idx" ON "recurring_expenses"("user_id", "is_active", "next_due_date");
DROP INDEX "groq_api_usage_created_at_idx";
CREATE INDEX "groq_api_usage_user_id_created_at_idx" ON "groq_api_usage"("user_id", "created_at" DESC);

COMMIT;
