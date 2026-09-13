"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, request } from "../lib/api";
import { money } from "../lib/expense";
import { preferredTimeZone } from "../lib/preferences";
import type { Category } from "../lib/types";
import { SiteHeader } from "./site-header";
import { ExpenseForm } from "./expense-form";
import { AnalyticsDetails, type Analytics } from "./analytics-details";

type Summary = Analytics & { month: string; time_zone: string };

export function Dashboard() {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const version = useRef(0);
  const load = useCallback(async (selected: string) => {
    const id = ++version.current;
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ time_zone: preferredTimeZone() });
      if (selected) query.set("month", selected);
      const [summary, cats] = await Promise.all([request<Summary>(`/analytics/monthly?${query}`), api.categories()]);
      if (id !== version.current) return;
      setData(summary); setCategories(cats.data);
    } catch (failure) { if (id === version.current) setError(failure instanceof Error ? failure.message : "Couldn't load the dashboard."); }
    finally { if (id === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const requests = version;
    const refresh = () => { void load(month); };
    // Fetch on mount/month changes and on returning to this tab after edits.
    refresh();
    window.addEventListener("focus", refresh);
    return () => { requests.current++; window.removeEventListener("focus", refresh); };
  }, [load, month]);
  const selected = month || data?.month || "";
  function move(delta: number) {
    const date = new Date(`${selected}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  }
  const title = selected ? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${selected}-01T00:00:00Z`)) : "Your month";
  return <><SiteHeader current="dashboard" /><main id="main-content" className="ledger-shell">
    <section className="page-heading"><div><p className="eyebrow">THE MONTH AT A GLANCE</p><h1>Dashboard</h1><p className="subtitle">What you paid, what’s yours, and where it went.</p></div><button id="add-expense" className="button primary add-button" disabled={loading || !categories.length} onClick={() => setEditing(true)}>Add Expense</button></section>
    <section className="month-controls" aria-label="Month navigation"><div><h2>{title}</h2><p>Based on transaction dates</p></div><div className="month-buttons">
      <button className="button secondary" aria-label="Previous month" disabled={loading || !selected || selected === "0001-01"} onClick={() => move(-1)}>←</button>
      <label className="sr-only" htmlFor="dashboard-month">Month</label><input id="dashboard-month" type="month" min="0001-01" max="9999-12" value={selected} disabled={loading} onChange={(e) => { if (/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value); }} />
      <button className="button secondary" aria-label="Next month" disabled={loading || !selected || selected === "9999-12"} onClick={() => move(1)}>→</button>
      <button className="button quiet" disabled={loading} onClick={() => { setMonth(""); void load(""); }}>Current month</button><button className="button quiet" disabled={loading} onClick={() => void load(month)}>Refresh</button></div></section>
    {notice && <p role="status" className="saved-notice">{notice}</p>}
    {error && <div className="error-box history-error" role="alert"><span>{error}</span><button className="button secondary" disabled={loading} onClick={() => void load(month)}>Retry</button></div>}
    {loading ? <div className="empty-state" role="status"><span className="spinner" /><p>Loading your month…</p></div> : error ? <p className="empty-state">Your monthly summary is unavailable. Retry to load current figures.</p> : data && <>
      {data.transaction_count === 0 && <div className="dashboard-empty"><h2>No expenses for this month yet.</h2><p>Add an expense, choose another month, or <Link href="/recurring">generate due recurring expenses</Link>.</p></div>}
      <section className="summary-grid" aria-label="Monthly totals">
        {([
          ["Total personal spending", data.effective_spending, "Your share of variable and recurring expenses", "primary-total"],
          ["Variable spending", data.variable_spending, "Everyday expenses · your share", ""],
          ["Fixed / recurring", data.recurring_spending, "Generated occurrences · your share", ""],
          ["Total paid", data.total_paid, "Full amount paid, including others’ shares", ""],
          ["Recoverable", data.recoverable, "Paid on behalf of others; settlements aren’t tracked", ""],
          ["Daily variable average", data.daily_variable_average, data.average_days ? `Variable spending ÷ ${data.average_days} calendar days${data.month === data.today.slice(0, 7) ? " (including today)" : ""}` : "Available once this month begins", ""],
        ] as const).map(([label, value, hint, className]) => <article className={`summary-card ${className}`} key={label} aria-label={label}><h2>{label}</h2><strong>{value === null ? "—" : money(value, data.currency)}</strong><p>{hint}</p></article>)}
      </section>
      <AnalyticsDetails data={data} /><p className="ledger-footer">Recurring totals include generated transactions only. All recorded dates in the selected month are included.</p>
    </>}
  </main>{editing && <ExpenseForm categories={categories} onClose={() => setEditing(false)} onSaved={(row) => { setEditing(false); setNotice(`Saved ${row.description}. Your share: ${money(row.my_share)}.`); void load(month); }} />}</>;
}
