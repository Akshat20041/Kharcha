"use client";
import { useRef, useState, type FormEvent } from "react";
import { Dialog } from "./dialog";
import { authorizedFetch } from "../lib/auth";

export function ExportExpenses({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState(false);
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [done, setDone] = useState(false); const sending = useRef(false);
  async function download(event: FormEvent) {
    event.preventDefault(); if (sending.current) return;
    sending.current = true; setBusy(true); setError(""); setDone(false);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      if (!base) throw new Error("The service connection is not configured.");
      const query = range ? new URLSearchParams({ start_date: start, end_date: end }) : new URLSearchParams();
      const response = await authorizedFetch(`${base.replace(/\/$/, "")}/exports/expenses.xlsx?${query}`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(response.status < 500 ? body?.error || "Check your date range." : "Couldn't prepare your export. Please retry.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = range ? `KharCha_${start}_to_${end}.xlsx` : "KharCha_all_expenses.xlsx";
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000); setDone(true);
    } catch (failure) { setError(failure instanceof Error && failure.name !== "TypeError" && failure.name !== "TimeoutError" ? failure.message : "Couldn't download your export. Check the backend connection and retry."); }
    finally { sending.current = false; setBusy(false); }
  }
  return <Dialog title="Export to Excel" busy={busy} onClose={onClose}><form onSubmit={download}>
    <div className="form-body"><p>A colourful spending summary, category and monthly analysis, and your complete transaction details.</p>
      <fieldset disabled={busy}><div className="field"><label htmlFor="export-period">Include</label><select id="export-period" data-initial-focus value={range ? "range" : "all"} onChange={(event) => setRange(event.target.value === "range")}><option value="all">All transactions</option><option value="range">Choose a date range</option></select></div>
        {range && <div className="field-row"><div className="field"><label htmlFor="export-start">From</label><input id="export-start" type="date" required min="0001-01-01" max="9999-12-31" value={start} onChange={(event) => setStart(event.target.value)} /></div><div className="field"><label htmlFor="export-end">Through</label><input id="export-end" type="date" required min={start || "0001-01-01"} max="9999-12-31" value={end} onChange={(event) => setEnd(event.target.value)} /></div></div>}
      </fieldset><p className="field-hint">Includes all matching transactions across every page. Dates are inclusive. Up to 20,000 transactions per workbook.</p>
      {error && <p role="alert" className="error-box">{error}</p>}{done && <p role="status" className="saved-notice">Your workbook is ready. Check your browser’s downloads.</p>}
    </div><footer className="dialog-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Close</button><button className="button primary" disabled={busy}>{busy ? "Preparing workbook…" : "Download Excel"}</button></footer>
  </form></Dialog>;
}
