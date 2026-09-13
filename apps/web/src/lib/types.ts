export type Category = { id: string; name: string };
export type Transaction = {
  id: string; total_amount: string; my_share: string; recoverable_amount: string; currency: string;
  description: string; category_id: string; transaction_date: string; transaction_time: string;
  time_zone: string; notes: string | null; is_split: boolean; participant_count: number | null;
  expense_nature: "variable" | "recurring_generated";
  merchant?: string | null;
};
export type ExpenseInput = {
  total_amount: string; description: string; category_id: string; transaction_date: string;
  transaction_time: string; time_zone: string; notes: string | null; is_split: boolean; participant_count: number | null;
  merchant?: string | null;
};
export type TransactionPage = { data: Transaction[]; limit: number; offset: number };
