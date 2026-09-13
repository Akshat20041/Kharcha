import { newestFirst } from "./expense";
import type { Transaction } from "./types";

// Sum server-returned decimal amounts in integer minor units, without rounding
// or recalculating individual splits. Totals cover only the supplied page.
function sum(rows: Transaction[], field: "my_share" | "total_amount" | "recoverable_amount") {
  const minor = rows.reduce((total, row) => {
    const [whole = "0", fraction = ""] = row[field].split(".");
    return total + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }, 0n);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
}

export function groupByDay(rows: Transaction[]) {
  const days = new Map<string, Transaction[]>();
  for (const row of newestFirst(rows)) {
    const group = days.get(row.transaction_date) ?? [];
    group.push(row);
    days.set(row.transaction_date, group);
  }
  return Array.from(days, ([date, transactions]) => ({
    date, transactions,
    // Keep currencies separate even if a future API returns more than INR.
    totals: [...new Set(transactions.map((row) => row.currency))].map((currency) => {
      const matching = transactions.filter((row) => row.currency === currency);
      return { currency, spent: sum(matching, "my_share"), paid: sum(matching, "total_amount"), recoverable: sum(matching, "recoverable_amount") };
    }),
  }));
}
