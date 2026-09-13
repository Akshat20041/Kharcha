"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { request } from "../lib/api";
import { money, newDraft } from "../lib/expense";
import { preferredTimeZone } from "../lib/preferences";
import { SiteHeader } from "./site-header";
import { AnalyticsDetails, type Analytics } from "./analytics-details";

export function RangeAnalytics() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const id = useRef(0);
  useEffect(() => () => { id.current++; }, []);
  async function load(from: string, to: string) {
    const current = ++id.current; setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ start_date: from, end_date: to, time_zone: preferredTimeZone() });
      const result = await request<Analytics>(`/analytics/range?${query}`);
      if (current === id.current) setData(result);
    } catch (failure) { if (current === id.current) setError(failure instanceof Error ? failure.message : "Couldn't load analytics."); }
    finally { if (current === id.current) setLoading(false); }
  }
  function preset(kind: "day" | "week" | "year") {
    const today = newDraft().transaction_date;
    const from = new Date(`${today}T00:00:00Z`);
    if (kind === "week") from.setUTCDate(from.getUTCDate() - (from.getUTCDay() + 6) % 7);
    if (kind === "year") from.setUTCMonth(0, 1);
    const first = from.toISOString().slice(0, 10);
    const last = kind === "year" ? `${today.slice(0, 4)}-12-31` : today;
    setStart(first); setEnd(last); void load(first, last);
  }
  function submit(event: FormEvent) { event.preventDefault(); void load(start, end); }
  return <><SiteHeader current="analytics" /><main id="main-content" className="ledger-shell"><section className="page-heading"><div><p className="eyebrow">LOOK A LITTLE CLOSER</p><h1>Analytics</h1><p className="subtitle">Explore a day, a week, a year, or your own date range.</p></div></section>
    <form className="range-controls" onSubmit={submit}><div className="range-presets"><button type="button" className="button secondary" disabled={loading} onClick={() => preset("day")}>Today</button><button type="button" className="button secondary" disabled={loading} onClick={() => preset("week")}>This week</button><button type="button" className="button secondary" disabled={loading} onClick={() => preset("year")}>This year</button></div><div className="field-row"><div className="field"><label htmlFor="range-start">From</label><input id="range-start" required type="date" min="0001-01-01" max="9999-12-31" value={start} onChange={(e) => setStart(e.target.value)} /></div><div className="field"><label htmlFor="range-end">Through</label><input id="range-end" required type="date" min={start || "0001-01-01"} max="9999-12-31" value={end} onChange={(e) => setEnd(e.target.value)} /></div></div><button className="button primary" disabled={loading}>Apply range</button><p className="field-hint">Inclusive dates · up to 366 days · weeks begin Monday</p></form>
    {error && <p role="alert" className="error-box">{error} Adjust the range or select Apply range to retry.</p>}
    {loading ? <p role="status" className="empty-state">Loading analytics…</p> : !error && data ? <><p className="range-caption">{data.start_date} – {data.end_date} · {data.transaction_count} transactions</p><section className="summary-grid" aria-label="Range totals">{[
      ["Personal spending", data.effective_spending], ["Variable spending", data.variable_spending], ["Recurring spending", data.recurring_spending],
      ["Total paid", data.total_paid], ["Recoverable", data.recoverable], ["Daily variable average", data.daily_variable_average],
    ].map(([label, value]) => <article className="summary-card" key={label}><h2>{label}</h2><strong>{value === null || value === undefined ? "—" : money(value)}</strong></article>)}</section><AnalyticsDetails data={data} /></> : !error && <p className="empty-state">Choose a period to explore your spending.</p>}
  </main></>;
}
