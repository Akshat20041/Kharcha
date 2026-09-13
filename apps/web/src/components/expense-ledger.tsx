"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "./site-header";
import { api } from "../lib/api";
import { groupByDay } from "../lib/day-groups";
import { displayDate, displayTime, money, newestFirst } from "../lib/expense";
import type { Category, Transaction } from "../lib/types";
import { ExpenseForm } from "./expense-form";
import { Dialog } from "./dialog";
import { QuickEntry } from "./quick-entry";
import { ExportExpenses } from "./export-expenses";

const PAGE_SIZE = 20;
function LedgerIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M8 3v18M11 8h6M11 12h6M11 16h4M3 7h4M3 12h4M3 17h4" /></svg>;
}
function DeleteExpense({ row, onClose, onDeleted }: { row: Transaction; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deleting = useRef(false);
  async function remove() {
    if (deleting.current) return;
    deleting.current = true; setBusy(true); setError("");
    try { await api.delete(row.id); onDeleted(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't delete this expense."); }
    finally { deleting.current = false; setBusy(false); }
  }
  return <Dialog title="Delete expense?" busy={busy} onClose={onClose}>
    <div className="form-body"><p>This expense will be permanently removed from your ledger.</p><div className="delete-summary"><strong>{row.description}</strong><span>{money(row.total_amount, row.currency)}</span><small>{displayDate(row.transaction_date)}</small></div>{error && <div role="alert" className="error-box">{error}</div>}</div>
    <footer className="dialog-footer"><button className="button secondary" data-initial-focus disabled={busy} onClick={onClose}>Keep expense</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete expense"}</button></footer>
  </Dialog>;
}

export function ExpenseLedger() {
  const [exporting, setExporting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ row?: Transaction } | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [notice, setNotice] = useState<{ text: string; row?: Transaction } | null>(null);
  const requestId = useRef(0);
  const fetchPage = useCallback(async (nextOffset: number) => {
    const id = ++requestId.current;
    try {
      const [categoryResult, transactions] = await Promise.all([api.categories(), api.transactions(nextOffset, PAGE_SIZE)]);
      if (id !== requestId.current) return;
      setError("");
      setCategories(categoryResult.data); setRows(transactions.data); setOffset(nextOffset); setHasNext(transactions.data.length === PAGE_SIZE);
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error ? failure.message : "Couldn't load your expenses.");
    } finally { if (id === requestId.current) setLoading(false); }
  }, []);
  function load(nextOffset: number) { setLoading(true); setError(""); return fetchPage(nextOffset); }
  useEffect(() => {
    const requests = requestId;
    // fetchPage updates state after the request settles; loading is initialized above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(0);
    return () => { requests.current++; };
  }, [fetchPage]);
  function saved(row: Transaction) {
    setNotice({ text: editor?.row ? "Expense updated" : "Expense saved", row }); setEditor(null);
    setRows((current) => newestFirst([row, ...current.filter((item) => item.id !== row.id)]).slice(0, PAGE_SIZE));
    void load(0);
  }
  return <>
    <SiteHeader current="transactions" />
    <main className="ledger-shell" id="main-content">
      <section className="page-heading"><div><p className="eyebrow">A LITTLE MORE CLARITY</p><h1>Your expenses</h1><p className="subtitle">Every expense, in one place.</p></div><button id="add-expense" className="button primary add-button" onClick={() => { setNotice(null); setEditor({}); }}><span aria-hidden="true">＋</span> Add Expense</button></section>
      <QuickEntry categories={categories} onSaved={saved} onManual={() => setEditor({})} />
      {notice && <section className="saved-notice" role="status"><div><span className="success-mark" aria-hidden="true">✓</span><strong>{notice.text}</strong>{notice.row && <span className="saved-description">{notice.row.description}</span>}</div>
        {notice.row && <dl className="saved-amounts"><div><dt>Total paid</dt><dd>{money(notice.row.total_amount, notice.row.currency)}</dd></div><div><dt>My share</dt><dd>{money(notice.row.my_share, notice.row.currency)}</dd></div><div><dt>Recoverable</dt><dd>{money(notice.row.recoverable_amount, notice.row.currency)}</dd></div></dl>}
        <button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></section>}
      {error && <div className="error-box history-error" role="alert"><div><strong>Couldn’t refresh your expenses</strong><p>{error}</p>{rows.length > 0 && <p>Showing the last loaded records.</p>}</div><button className="button secondary" onClick={() => void load(offset)} disabled={loading}>Retry</button></div>}
      <section className="history-panel" aria-label="Transaction history" aria-busy={loading}>
        <header className="history-heading"><div><h2>Transaction history</h2><p>Newest first <span aria-hidden="true">·</span> {PAGE_SIZE} per page</p></div><div className="export-actions"><button className="button secondary" onClick={() => setExporting(true)}>Export Excel</button><button className="button quiet" disabled={loading} onClick={() => void load(offset)}>{loading ? "Loading…" : "Refresh"}</button></div></header>
        {loading && rows.length === 0 ? <div className="empty-state" role="status"><span className="spinner" /><p>Loading your expenses…</p></div>
          : rows.length === 0 ? <div className="empty-state"><div className="empty-icon"><LedgerIcon /></div><h3>{error ? "Your ledger is unavailable" : offset > 0 ? "You’ve reached the end" : "No expenses recorded yet."}</h3><p>{error ? "Retry when your connection is restored." : offset > 0 ? "Return to the previous page to see your expenses." : "From your morning coffee to dinner with friends,\nstart with your first expense."}</p>{!error && offset === 0 && <button className="button secondary" onClick={() => setEditor({})}>Add your first expense</button>}</div>
          : <div className="transaction-list">
            <p className="day-summary-note">Daily summaries include only expenses on this page. A day may continue on another page.</p>
            {groupByDay(rows).map((day) => <section className="day-group" key={day.date} aria-label={displayDate(day.date)}>
              <header className="day-heading">
                <div><h3><time dateTime={day.date}>{displayDate(day.date)}</time></h3><p>{day.transactions.length} {day.transactions.length === 1 ? "expense" : "expenses"} on this page</p></div>
                <div className="day-totals">{day.totals.map((total) => <div key={total.currency}>
                  <p className="day-spent"><strong>{money(total.spent, total.currency)}</strong> personal spending</p>
                  <p className="day-paid">Paid {money(total.paid, total.currency)}{total.recoverable !== "0.00" && <span>{money(total.recoverable, total.currency)} recoverable</span>}</p>
                </div>)}</div>
              </header>
              <div className="table-heading" aria-hidden="true"><span>Expense</span><span>Time</span><span>Total paid</span><span>My share</span><span>Actions</span></div>
            {day.transactions.map((row) => <article className="transaction-row" key={row.id} aria-label={row.description}>
              <div className="expense-description"><span className="row-icon" aria-hidden="true"><LedgerIcon /></span><div><h3>{row.description}</h3><p>{categories.find((category) => category.id === row.category_id)?.name ?? "Category unavailable"}</p><div className="badges">{row.is_split && <span className="badge">Equal split · {row.participant_count} people</span>}{row.expense_nature === "recurring_generated" && <span className="badge neutral">Recurring</span>}</div>{row.notes && <p className="transaction-note">{row.notes}</p>}</div></div>
              <div className="expense-date"><time dateTime={`${row.transaction_date}T${row.transaction_time}`}>{displayTime(row.transaction_time)}</time></div>
              <div className="expense-money"><span className="mobile-label">Total paid</span><strong>{money(row.total_amount, row.currency)}</strong></div>
              <div className="expense-money personal"><span className="mobile-label">My share</span><strong>{money(row.my_share, row.currency)}</strong>{row.is_split && <small>{money(row.recoverable_amount, row.currency)} recoverable</small>}</div>
              <div className="row-actions"><button className="text-button" onClick={() => setEditor({ row })} disabled={loading}>Edit</button><button className="text-button delete-link" onClick={() => setDeleting(row)} disabled={loading}>Delete</button></div>
            </article>)}</section>)}
          </div>}
        {(offset > 0 || hasNext) && <footer className="pagination"><button className="button secondary" disabled={loading || offset === 0} onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}>Previous</button><span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span><button className="button secondary" disabled={loading || !hasNext} onClick={() => void load(offset + PAGE_SIZE)}>Next</button></footer>}
      </section><p className="ledger-footer">A clear record of what you paid, and what’s yours.</p>
    </main>
    {exporting && <ExportExpenses onClose={() => setExporting(false)} />}
    {editor && (categories.length > 0 ? <ExpenseForm categories={categories} transaction={editor.row} onClose={() => setEditor(null)} onSaved={saved} /> : <Dialog title="Add expense" busy={false} onClose={() => setEditor(null)}><div className="form-body"><div role="alert" className="error-box">{loading ? "Loading categories…" : error || "Categories are unavailable. Please refresh or try again later."}</div></div><footer className="dialog-footer"><button className="button secondary" onClick={() => setEditor(null)}>Close</button><button className="button primary" disabled={loading} onClick={() => void load(offset)}>Retry categories</button></footer></Dialog>)}
    {deleting && <DeleteExpense row={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
      setRows((current) => current.filter((row) => row.id !== deleting.id));
      setDeleting(null); setNotice({ text: "Expense deleted" }); void load(0);
    }} />}
  </>;
}
