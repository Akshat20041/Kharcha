"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, authEnabled } from "../lib/auth";

export function AccountControls() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try {
      const { error } = await authClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/login");
    } catch { setError("Couldn’t sign out. Check your connection and retry."); }
    finally { setBusy(false); }
  }
  return <div className="account-controls"><Link href="/settings">Settings</Link>{authEnabled && <button className="text-button" onClick={logout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>}{error && <span role="alert">{error}</span>}</div>;
}
