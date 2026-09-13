-- Prisma cannot express CHECK constraints. Keep financial invariants in SQL too.
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_not_blank" CHECK (length(btrim(name)) > 0);

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amounts_valid" CHECK (
    total_amount > 0 AND total_amount <= 999999999999.99 AND
    my_share >= 0 AND my_share <= total_amount AND
    recoverable_amount = total_amount - my_share
  ),
  ADD CONSTRAINT "transactions_split_valid" CHECK (
    (NOT is_split AND participant_count IS NULL AND split_type IS NULL AND my_share = total_amount)
    OR (is_split AND participant_count IS NOT NULL AND participant_count >= 2 AND
        split_type IS NOT NULL AND split_type = 'equal' AND
        my_share = round(total_amount / participant_count, 2))
  ),
  ADD CONSTRAINT "transactions_source_valid" CHECK (
    (expense_nature = 'variable' AND recurring_expense_id IS NULL AND occurrence_date IS NULL)
    OR (expense_nature = 'recurring_generated' AND recurring_expense_id IS NOT NULL AND occurrence_date IS NOT NULL)
  ),
  ADD CONSTRAINT "transactions_description_not_blank" CHECK (length(btrim(description)) > 0),
  ADD CONSTRAINT "transactions_currency_valid" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "transactions_timezone_not_blank" CHECK (length(btrim(time_zone)) > 0),
  ADD CONSTRAINT "transactions_date_valid" CHECK (transaction_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  ADD CONSTRAINT "transactions_time_valid" CHECK (transaction_time < TIME '24:00:00'),
  ADD CONSTRAINT "transactions_occurrence_valid" CHECK (occurrence_date IS NULL OR occurrence_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');

ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_amounts_valid" CHECK (
    total_amount > 0 AND total_amount <= 999999999999.99 AND my_share >= 0 AND my_share <= total_amount
  ),
  ADD CONSTRAINT "recurring_split_valid" CHECK (
    (NOT is_split AND participant_count IS NULL AND my_share = total_amount)
    OR (is_split AND participant_count IS NOT NULL AND participant_count >= 2 AND
        my_share = round(total_amount / participant_count, 2))
  ),
  ADD CONSTRAINT "recurring_name_not_blank" CHECK (length(btrim(name)) > 0),
  ADD CONSTRAINT "recurring_currency_valid" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "recurring_timezone_not_blank" CHECK (length(btrim(time_zone)) > 0),
  ADD CONSTRAINT "recurring_dates_valid" CHECK (
    start_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND
    next_due_date BETWEEN start_date AND DATE '9999-12-31' AND
    (end_date IS NULL OR end_date BETWEEN start_date AND DATE '9999-12-31')
  );
