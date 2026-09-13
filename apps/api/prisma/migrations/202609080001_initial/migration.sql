-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('expense');

-- CreateEnum
CREATE TYPE "ExpenseNature" AS ENUM ('variable', 'recurring_generated');

-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('equal');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('monthly', 'weekly', 'yearly');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CreditCard', 'DebitCard', 'Cash', 'BankTransfer', 'Wallet', 'Other');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "transaction_type" "TransactionType" NOT NULL DEFAULT 'expense',
    "expense_nature" "ExpenseNature" NOT NULL DEFAULT 'variable',
    "total_amount" DECIMAL(14,2) NOT NULL,
    "my_share" DECIMAL(14,2) NOT NULL,
    "recoverable_amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "description" VARCHAR(500) NOT NULL,
    "merchant" VARCHAR(200),
    "category_id" UUID NOT NULL,
    "subcategory" VARCHAR(100),
    "notes" VARCHAR(5000),
    "transaction_date" DATE NOT NULL,
    "transaction_time" TIME(0) NOT NULL,
    "time_zone" VARCHAR(100) NOT NULL,
    "payment_method" "PaymentMethod",
    "is_split" BOOLEAN NOT NULL DEFAULT false,
    "participant_count" INTEGER,
    "split_type" "SplitType",
    "recurring_expense_id" UUID,
    "occurrence_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category_id" UUID NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "my_share" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "is_split" BOOLEAN NOT NULL DEFAULT false,
    "participant_count" INTEGER,
    "frequency" "Frequency" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "next_due_date" DATE NOT NULL,
    "time_zone" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(5000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "transactions_transaction_date_transaction_time_id_idx" ON "transactions"("transaction_date" DESC, "transaction_time" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurring_expense_id_occurrence_date_key" ON "transactions"("recurring_expense_id", "occurrence_date");

-- CreateIndex
CREATE INDEX "recurring_expenses_category_id_idx" ON "recurring_expenses"("category_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_is_active_next_due_date_idx" ON "recurring_expenses"("is_active", "next_due_date");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_expense_id_fkey" FOREIGN KEY ("recurring_expense_id") REFERENCES "recurring_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
