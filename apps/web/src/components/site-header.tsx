import Link from "next/link";
import { AccountControls } from "./account-controls";

export function SiteHeader({ current }: { current: "dashboard" | "transactions" | "recurring" | "analytics" | "settings" }) {
  return <header className="site-header"><div className="header-inner">
    <Link href="/dashboard" className="brand" aria-label="KharCha home">KharCha<span className="brand-dot">.</span></Link>
    <nav className="ledger-nav" aria-label="Main navigation">
      <Link href="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>Dashboard</Link>
      <Link href="/analytics" aria-current={current === "analytics" ? "page" : undefined}>Analytics</Link>
      <Link href="/" aria-current={current === "transactions" ? "page" : undefined}>Transactions</Link>
      <Link href="/recurring" aria-current={current === "recurring" ? "page" : undefined}>Recurring</Link>
    </nav><AccountControls /></div></header>;
}
