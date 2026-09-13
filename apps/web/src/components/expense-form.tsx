"use client";
import { useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { editDraft, newDraft, prepareExpense, type ExpenseDraft } from "../lib/expense";
import type { Category, Transaction } from "../lib/types";
import { Dialog } from "./dialog";

export function ExpenseForm({ categories, transaction, initialDraft, warnings = [], onClose, onSaved }: {
  categories: Category[]; transaction?: Transaction; initialDraft?: ExpenseDraft; warnings?: string[]; onClose: () => void; onSaved: (row: Transaction) => void;
}) {
  const [draft, setDraft] = useState(() => transaction ? editDraft(transaction) : initialDraft ?? newDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  function change<K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }
  const fieldProps = (field: keyof ExpenseDraft) => ({
    id: field, name: field, "aria-invalid": !!errors[field],
    "aria-describedby": errors[field] ? `${field}-error` : undefined,
  });
  const message = (field: keyof ExpenseDraft) => errors[field] ? <p className="field-error" id={`${field}-error`}>{errors[field]}</p> : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const { input, errors: validation } = prepareExpense(draft);
    if (!categories.some((category) => category.id === input.category_id)) validation.category_id = "Choose an available category.";
    setErrors(validation); setError("");
    if (Object.keys(validation).length) {
      setError("Check the highlighted fields and try again.");
      form.current?.querySelector<HTMLElement>(`[name="${Object.keys(validation)[0]}"]`)?.focus();
      return;
    }
    submitting.current = true; setBusy(true);
    try { onSaved(transaction ? await api.update(transaction.id, input) : await api.create(input)); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't save the expense. Please retry.");
      if (failure instanceof ApiError) setErrors(failure.issues);
      requestAnimationFrame(() => errorSummary.current?.focus());
    } finally { submitting.current = false; setBusy(false); }
  }
  return <Dialog title={transaction ? "Edit expense" : initialDraft ? "Review expense" : "Add expense"} busy={busy} onClose={onClose}>
    <form ref={form} noValidate onSubmit={submit} aria-busy={busy}>
      <div className="form-body">
        {initialDraft && <div className="draft-review"><p>Review every field. Nothing is saved until you confirm.</p>{warnings.length > 0 && <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</div>}
        {error && <div ref={errorSummary} tabIndex={-1} className="error-box" role="alert">{error}</div>}
        <fieldset disabled={busy}>
          <div className="field amount-field"><label htmlFor="total_amount">Amount <span>INR</span></label>
            <div className="amount-input"><span aria-hidden="true">₹</span><input {...fieldProps("total_amount")} data-initial-focus inputMode="decimal" placeholder="0.00" maxLength={20} value={draft.total_amount} onChange={(e) => change("total_amount", e.target.value)} /></div>{message("total_amount")}
          </div>
          <div className="field"><label htmlFor="description">Description</label><input {...fieldProps("description")} placeholder="What was it for?" maxLength={500} value={draft.description} onChange={(e) => change("description", e.target.value)} />{message("description")}</div>
          <div className="field"><label htmlFor="merchant">Merchant <span>Optional</span></label><input {...fieldProps("merchant")} maxLength={200} placeholder="e.g. Meghana" value={draft.merchant ?? ""} onChange={(e) => change("merchant", e.target.value)} />{message("merchant")}</div>
          <div className="field"><label htmlFor="category_id">Category</label><select {...fieldProps("category_id")} value={draft.category_id} onChange={(e) => change("category_id", e.target.value)}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{message("category_id")}</div>
          <div className="field-row">
            <div className="field"><label htmlFor="transaction_date">Date</label><input {...fieldProps("transaction_date")} type="date" min="0001-01-01" max="9999-12-31" value={draft.transaction_date} onChange={(e) => change("transaction_date", e.target.value)} />{message("transaction_date")}</div>
            <div className="field"><label htmlFor="transaction_time">Time</label><input {...fieldProps("transaction_time")} type="time" step="1" value={draft.transaction_time} onChange={(e) => change("transaction_time", e.target.value)} />{message("transaction_time")}</div>
          </div>
          <p className="field-hint timezone">Local time · {draft.time_zone.replaceAll("_", " ")}</p>
          <div className={`split-panel ${draft.is_split ? "is-split" : ""}`}>
            <label className="split-label" htmlFor="is_split"><span><strong>Split expense</strong><small>Share this expense equally.</small></span><input id="is_split" name="is_split" type="checkbox" role="switch" checked={draft.is_split} onChange={(e) => change("is_split", e.target.checked)} /></label>
            {draft.is_split && <div className="field participant-field"><label htmlFor="participant_count">Number of people</label><input {...fieldProps("participant_count")} type="number" min="2" max="2147483647" step="1" inputMode="numeric" value={draft.participant_count} onChange={(e) => change("participant_count", e.target.value)} />{message("participant_count")}<p className="field-hint">Include yourself. Your share will be shown after saving.</p></div>}
          </div>
          <div className="field notes-field"><label htmlFor="notes">Notes <span>Optional</span></label><textarea {...fieldProps("notes")} rows={2} maxLength={5000} placeholder="Anything you’d like to remember" value={draft.notes} onChange={(e) => change("notes", e.target.value)} />{message("notes")}</div>
        </fieldset>
      </div>
      <footer className="dialog-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{busy ? transaction ? "Updating…" : "Saving…" : transaction ? "Save changes" : initialDraft ? "Confirm expense" : "Save expense"}</button></footer>
    </form>
  </Dialog>;
}
