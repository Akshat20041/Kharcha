"use client";
import { useRef, useState, type FormEvent } from "react";
import { request } from "../lib/api";
import { newDraft, type ExpenseDraft } from "../lib/expense";
import { preferredTimeZone } from "../lib/preferences";
import type { Category, Transaction } from "../lib/types";
import { ExpenseForm } from "./expense-form";

type Parsed = { draft: { total_amount: string | null; description: string; merchant: string | null; category_id: string;
  transaction_date: string | null; transaction_time: string | null; time_zone: string; is_split: boolean; participant_count: number | null; notes: string | null }; warnings: string[] };

export function QuickEntry({ categories, onSaved, onManual }: { categories: Category[]; onSaved: (row: Transaction) => void; onManual: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ draft: ExpenseDraft; warnings: string[] } | null>(null);
  const sending = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  async function parse(event: FormEvent) {
    event.preventDefault(); if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const result = await request<Parsed>("/expense-parser/parse", "POST", { text, time_zone: preferredTimeZone() });
      setReview({ warnings: result.warnings, draft: { ...newDraft(), ...result.draft,
        total_amount: result.draft.total_amount ?? "", merchant: result.draft.merchant ?? "",
        transaction_date: result.draft.transaction_date ?? "", transaction_time: result.draft.transaction_time ?? "",
        participant_count: result.draft.participant_count === null ? "" : String(result.draft.participant_count), notes: result.draft.notes ?? "" } });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't read this expense. You can still enter it manually."); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section className="quick-entry" aria-label="Quick expense entry"><form onSubmit={parse} aria-busy={busy}>
    <label htmlFor="quick-expense">What did you spend?</label><div className="quick-entry-controls"><input ref={field} id="quick-expense" required maxLength={1500} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder="1200 dinner at Meghana yesterday split 4" /><button className="button primary" disabled={busy || !categories.length}>{busy ? "Reading expense…" : "Review expense"}</button></div>
    <p className="field-hint">AI helps fill the form; you review before saving. Your message is sent to Groq when you choose Review.</p>
    {error && <p className="error-box" role="alert">{error}</p>}<button type="button" className="text-button" disabled={busy} onClick={onManual}>Enter manually</button>
  </form>{review && <ExpenseForm categories={categories} initialDraft={review.draft} warnings={review.warnings} onClose={() => { setReview(null); field.current?.focus(); }} onSaved={(row) => { setReview(null); setText(""); onSaved(row); }} />}</section>;
}
