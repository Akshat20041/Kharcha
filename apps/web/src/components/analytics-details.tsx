import { useId } from "react";
import { displayDate, money } from "../lib/expense";

export type Analytics = { today: string; currency: string; transaction_count: number; start_date: string; end_date: string;
  variable_spending: string; recurring_spending: string; effective_spending: string; total_paid: string; recoverable: string;
  average_days: number; daily_variable_average: string | null;
  categories: { id: string; name: string; spending: string; percentage: string }[];
  daily_series: { date: string; spending: string }[];
  comparison: { start_date: string; end_date: string; personal_spending: string; change_amount: string; change_percentage: string | null; direction: string } | null };

export function AnalyticsDetails({ data }: { data: Analytics }) {
  const titleId = useId();
  // Floating-point conversion is used only for chart coordinates, never totals.
  const max = Math.max(1, ...data.daily_series.map((day) => Number(day.spending)));
  const peak = data.daily_series.reduce((value, day) => Number(day.spending) > Number(value) ? day.spending : value, "0.00");
  const points = data.daily_series.map((day, index) => `${20 + index / Math.max(1, data.daily_series.length - 1) * 720},${170 - Number(day.spending) / max * 145}`).join(" ");
  const comparison = data.comparison;
  return <>
    <section className="period-comparison" aria-label="Period comparison"><h2>Compared with the previous period</h2>{comparison ? <>
      <p><strong>{money(comparison.change_amount.replace(/^-/, ""))} {comparison.direction === "same" ? "change" : comparison.direction}</strong>{comparison.change_percentage !== null ? ` (${comparison.change_percentage.replace(/^-/, "")}%)` : " · No percentage comparison when previous spending is zero."}</p>
      <p>Previous: {money(comparison.personal_spending)} · {displayDate(comparison.start_date)} – {displayDate(comparison.end_date)}</p>
      {data.end_date >= data.today && <p>This period is not complete. Compare recorded totals with that timing in mind.</p>}
    </> : <p>No earlier supported period is available.</p>}</section>
    <section className="history-panel trend-panel" aria-label="Daily personal spending"><header className="history-heading"><div><h2>Daily personal spending</h2><p>Your share, including recurring expenses · {data.transaction_count} {data.transaction_count === 1 ? "transaction" : "transactions"}</p><p>Highest day: {money(peak)}</p></div></header>
      <svg className="spending-chart" viewBox="0 0 760 180" role="img" aria-labelledby={titleId}><title id={titleId}>Daily spending from {data.start_date} to {data.end_date}. Exact amounts are in the daily values table below.</title>
        <line x1="20" y1="170" x2="740" y2="170" stroke="#ccd9d0" /><polyline points={points} fill="none" stroke="#176b55" strokeWidth="3" />
        {data.daily_series.length === 1 && <circle cx="20" cy={170 - Number(data.daily_series[0]!.spending) / max * 145} r="4" fill="#176b55" />}
      </svg><div className="chart-range"><span>{displayDate(data.start_date)}</span><span>{displayDate(data.end_date)}</span></div><details className="daily-values"><summary>View daily values</summary><div className="table-scroll"><table><caption className="sr-only">Daily personal spending amounts</caption><thead><tr><th scope="col">Date</th><th scope="col">Personal spending</th></tr></thead><tbody>{data.daily_series.map((day) => <tr key={day.date}><th scope="row">{displayDate(day.date)}</th><td>{money(day.spending)}</td></tr>)}</tbody></table></div></details>
    </section>
    <section className="history-panel category-panel" aria-label="Personal spending by category"><header className="history-heading"><div><h2>Personal spending by category</h2><p>Variable and recurring · percentage of total personal spending</p></div></header>
      {data.categories.length ? <ul className="category-list">{data.categories.map((category) => <li key={category.id}><div><span>{category.name}</span><small>{category.percentage}% of personal spending</small></div><strong>{money(category.spending)}</strong></li>)}</ul> : <p className="empty-state">No category spending in this period.</p>}
    </section>
  </>;
}
