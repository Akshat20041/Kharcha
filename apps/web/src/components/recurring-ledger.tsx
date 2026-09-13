"use client";
import Link from "next/link";
import { SiteHeader } from "./site-header";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, request, ApiError } from "../lib/api";
import { money, displayDate, newDraft } from "../lib/expense";
import type { Category } from "../lib/types";
import { Dialog } from "./dialog";

type RuleInput = { name: string; category_id: string; total_amount: string; frequency: "monthly" | "weekly" | "yearly";
  start_date: string; end_date: string | null; time_zone: string; is_split: boolean; participant_count: number | null; notes: string | null };
type Rule = RuleInput & { id: string; my_share: string; currency: string; next_due_date: string; is_active: boolean; schedule_locked: boolean };
const endpoint = (id: string) => `/recurring-expenses/${encodeURIComponent(id)}`;

function RuleForm({ row, categories, onClose, onSaved }: { row?: Rule; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => {
    const local = newDraft();
    return { name: row?.name ?? "", category_id: row?.category_id ?? "", total_amount: row?.total_amount ?? "",
      frequency: row?.frequency ?? "monthly", start_date: row?.start_date ?? local.transaction_date,
      end_date: row?.end_date ?? "", time_zone: row?.time_zone ?? local.time_zone, is_split: row?.is_split ?? false,
      participant_count: String(row?.participant_count ?? 2), notes: row?.notes ?? "" };
  });
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const errorSummary = useRef<HTMLParagraphElement>(null);
  function set(key: keyof typeof draft, value: string | boolean) { setDraft((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const data = { ...draft, total_amount: draft.total_amount.trim().replace(/^0+(?=\d)/, "").replace(/^\./, "0."),
        end_date: draft.end_date || null, notes: draft.notes.trim() || null,
        participant_count: draft.is_split ? Number(draft.participant_count) : null };
      await request(row ? endpoint(row.id) : "/recurring-expenses", row ? "PATCH" : "POST", data);
      onSaved();
    } catch (failure) {
      setError(failure instanceof ApiError && Object.keys(failure.issues).length
        ? Object.entries(failure.issues).map(([field, message]) => `${field.replaceAll("_", " ")}: ${message}`).join(". ")
        : failure instanceof Error ? failure.message : "Couldn't save the recurring expense.");
      requestAnimationFrame(() => errorSummary.current?.focus());
    } finally { sending.current = false; setBusy(false); }
  }
  return <Dialog title={row ? "Edit recurring expense" : "Add recurring expense"} busy={busy} onClose={onClose}>
    <form onSubmit={submit} aria-busy={busy}><div className="form-body">{error && <p ref={errorSummary} tabIndex={-1} role="alert" className="error-box">{error}</p>}
      <fieldset disabled={busy}>
        <div className="field"><label htmlFor="rule-name">Name</label><input id="rule-name" data-initial-focus required maxLength={200} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rent" /></div>
        <div className="field"><label htmlFor="rule-amount">Amount paid (INR)</label><input id="rule-amount" required inputMode="decimal" value={draft.total_amount} onChange={(e) => set("total_amount", e.target.value)} placeholder="0.00" /></div>
        <div className="field"><label htmlFor="rule-category">Category</label><select id="rule-category" required value={draft.category_id} onChange={(e) => set("category_id", e.target.value)}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        <div className="field"><label htmlFor="rule-frequency">Frequency</label><select id="rule-frequency" disabled={row?.schedule_locked} value={draft.frequency} onChange={(e) => set("frequency", e.target.value)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select></div>
        <div className="field-row"><div className="field"><label htmlFor="rule-start">Start date</label><input id="rule-start" type="date" required min="0001-01-01" max="9999-12-31" disabled={row?.schedule_locked} value={draft.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
        <div className="field"><label htmlFor="rule-end">End date (optional)</label><input id="rule-end" type="date" min={draft.start_date} max="9999-12-31" value={draft.end_date} onChange={(e) => set("end_date", e.target.value)} /></div></div>
        <p className="field-hint">Local dates · {draft.time_zone}. {row?.schedule_locked ? "To change frequency or start date after generation, deactivate this rule and create a new one." : "Short months use their last day, then return to the original day."}</p>
        <div className="split-panel"><label className="split-label"><span><strong>Split expense</strong><small>Share equally, including you.</small></span><input type="checkbox" role="switch" checked={draft.is_split} onChange={(e) => set("is_split", e.target.checked)} /></label>
          {draft.is_split && <div className="field participant-field"><label htmlFor="rule-people">Number of people</label><input id="rule-people" type="number" min="2" max="2147483647" required value={draft.participant_count} onChange={(e) => set("participant_count", e.target.value)} /></div>}</div>
        <div className="field"><label htmlFor="rule-notes">Notes (optional)</label><textarea id="rule-notes" maxLength={5000} value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        <p className="field-hint">Saving a rule does not add transactions. Generate due expenses when you are ready. Edits apply only to occurrences generated afterward, including any overdue ones.</p>
      </fieldset></div><footer className="dialog-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save recurring expense"}</button></footer></form>
  </Dialog>;
}

export function RecurringLedger() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<{ row?: Rule } | null>(null);
  const [action, setAction] = useState<{ row: Rule; kind: "generate" | "deactivate" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const acting = useRef(false);
  const version = useRef(0);
  const fetchRows = useCallback(async (page: number) => {
    const current = ++version.current;
    try {
      const [rules, cats] = await Promise.all([request<{ data: Rule[] }>(`/recurring-expenses?limit=20&offset=${page}`), api.categories()]);
      if (current !== version.current) return;
      setRows(rules.data); setCategories(cats.data); setOffset(page); setError("");
    } catch (failure) { if (current === version.current) setError(failure instanceof Error ? failure.message : "Couldn't load recurring expenses."); }
    finally { if (current === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const requests = version;
    // The async loader sets state after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRows(0);
    return () => { requests.current++; };
  }, [fetchRows]);
  function load(page: number) { setLoading(true); void fetchRows(page); }
  async function confirm() {
    if (!action || acting.current) return;
    acting.current = true; setBusy(true); setActionError("");
    try {
      if (action.kind === "generate") {
        const result = await request<{ created: number; has_more: boolean }>(`${endpoint(action.row.id)}/generate`, "POST", {});
        setNotice(`${result.created} expense${result.created === 1 ? "" : "s"} generated. ${result.has_more ? "More dates are due; generate again to continue." : "This rule is up to date."}`);
      } else { await request(endpoint(action.row.id), "PATCH", { is_active: false }); setNotice("Recurring expense deactivated. Saved transactions are unchanged."); }
      setAction(null); load(offset);
    } catch (failure) { setActionError(failure instanceof Error ? failure.message : "Couldn't complete this action."); }
    finally { acting.current = false; setBusy(false); }
  }
  return <>
    <SiteHeader current="recurring" />
    <main id="main-content" className="ledger-shell"><section className="page-heading"><div><p className="eyebrow">THE REGULAR THINGS</p><h1>Recurring expenses</h1><p className="subtitle">Rent, subscriptions, and everything that repeats.</p></div><button className="button primary" disabled={loading || !categories.length} onClick={() => setEditor({})}>Add recurring expense</button></section>
      {notice && <p className="saved-notice" role="status">{notice} <Link href="/">View transactions</Link></p>}
      {error && <div className="error-box history-error" role="alert">{error}<button className="button secondary" disabled={loading} onClick={() => load(offset)}>Retry</button></div>}
      <section className="history-panel" aria-label="Recurring expenses" aria-busy={loading}><header className="history-heading"><div><h2>Your recurring expenses</h2><p>Generate manually through today · 20 per page</p></div><button className="button quiet" disabled={loading} onClick={() => load(offset)}>{loading ? "Loading…" : "Refresh"}</button></header>
        {!rows.length ? <div className="empty-state"><h3>{loading ? "Loading recurring expenses…" : error ? "Recurring expenses are unavailable" : "No recurring expenses on this page."}</h3></div> : rows.map((row) => <article className="recurring-row" key={row.id} aria-label={row.name}>
          <div><h3>{row.name}</h3><p>{categories.find((category) => category.id === row.category_id)?.name} · {row.frequency}</p><span className="badge">{!row.is_active ? "Inactive" : row.end_date && row.next_due_date > row.end_date ? "Ended" : "Active"}</span>{row.is_split && <span className="badge">Equal split · {row.participant_count} people</span>}<p>Next scheduled: {displayDate(row.next_due_date)}</p>{row.end_date && <p>Ends {displayDate(row.end_date)}</p>}{row.notes && <p>{row.notes}</p>}</div>
          <div className="expense-money personal"><span className="mobile-label">My share</span><strong>{money(row.my_share)} my share</strong><small>Paid {money(row.total_amount)} per occurrence</small></div>
          <div className="recurring-actions"><button className="button secondary" disabled={loading} onClick={() => setEditor({ row })}>Edit</button>{row.is_active && <><button className="button primary" disabled={loading || !!row.end_date && row.next_due_date > row.end_date} onClick={() => { setActionError(""); setAction({ row, kind: "generate" }); }}>Generate due expenses</button><button className="text-button delete-link" disabled={loading} onClick={() => { setActionError(""); setAction({ row, kind: "deactivate" }); }}>Deactivate</button></>}</div>
        </article>)}
        {(offset > 0 || rows.length === 20) && <footer className="pagination"><button className="button secondary" disabled={loading || offset === 0} onClick={() => load(offset - 20)}>Previous</button><span>Page {offset / 20 + 1}</span><button className="button secondary" disabled={loading || rows.length < 20} onClick={() => load(offset + 20)}>Next</button></footer>}
      </section></main>
    {editor && <RuleForm row={editor.row} categories={categories} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice("Recurring expense saved."); load(0); }} />}
    {action && <Dialog title={action.kind === "generate" ? "Generate due expenses?" : "Deactivate recurring expense?"} busy={busy} onClose={() => setAction(null)}><div className="form-body"><p><strong>{action.row.name}</strong></p><p>{action.kind === "generate" ? "Add all outstanding occurrences through today in this rule’s timezone, up to 100 at a time. Transactions use the current rule amount and local midnight. Previously generated dates will not be duplicated." : "Stop generation for this rule. Existing transactions stay in your history."}</p>{actionError && <p role="alert" className="error-box">{actionError}</p>}</div><footer className="dialog-footer"><button className="button secondary" data-initial-focus disabled={busy} onClick={() => setAction(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={() => void confirm()}>{busy ? "Working…" : "Confirm"}</button></footer></Dialog>}
  </>;
}
