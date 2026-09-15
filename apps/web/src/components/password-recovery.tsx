"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient, authEnabled } from "../lib/auth";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  useEffect(() => {
    if (!authEnabled) return;
    if (!reset) { queueMicrotask(() => setReady(true)); return; }
    let active = true;
    async function restore() {
      try {
        // The SDK consumes and verifies the PKCE code during initialization.
        // Never treat a URL flag as proof of authentication.
        const result = await authClient().auth.getSession();
        const current = new URL(window.location.href);
        if (result.error || !result.data.session || current.searchParams.has("code") || current.searchParams.has("error") || current.hash.includes("error=")) {
          if (active) setError("This reset link is invalid or expired. Request a new link and open it in the same browser where you requested it.");
        } else if (active) setReady(true);
      } catch { if (active) setError("Could not verify the reset link. Please request a new one."); }
    }
    void restore();
    return () => { active = false; };
  }, [reset]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || done || !ready) return;
    setError("");
    if (reset && password !== confirmation) { setError("Passwords do not match."); return; }
    sending.current = true; setBusy(true);
    try {
      const client = authClient();
      const result = reset
        ? await client.auth.updateUser({ password })
        : await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (result.error) throw result.error;
      setDone(true); setPassword(""); setConfirmation("");
      if (reset) {
        const signedOut = await client.auth.signOut({ scope: "global" });
        if (signedOut.error) setError("Your password changed, but sign-out failed. Please sign out before using the new password.");
      }
    } catch (failure) {
      const code = (failure as { code?: string }).code;
      setError(code === "over_email_send_rate_limit" || code === "over_request_rate_limit"
        ? "Too many attempts. Please wait before trying again."
        : reset ? "Could not update your password. Use at least 8 characters, or request a new reset link."
        : "Could not send a reset link. Please try again shortly.");
    } finally { sending.current = false; setBusy(false); }
  }
  return <main className="auth-card" id="main-content">
    <p className="eyebrow">YOUR KHARCHA</p><h1>{reset ? "Choose a new password" : "Forgot password?"}</h1>
    {!authEnabled ? <p>Password recovery is available when accounts are enabled.</p> : <>
      {done ? <p className="saved-notice" role="status">{reset ? "Password updated. You can now sign in with your new password." : "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder, and open the link in this browser."}</p> : ready ? <form onSubmit={submit}>
        {reset ? <>
          <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
        </> : <div className="field"><label htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" autoComplete="email" maxLength={254} required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} /></div>}
        <button className="button primary" disabled={busy}>{busy ? "Please wait..." : reset ? "Update password" : "Send reset link"}</button>
      </form> : !error && <p role="status">{reset ? "Checking your reset link..." : "Loading..."}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
      {reset && !done && <p><Link href="/forgot-password">Request a new reset link</Link></p>}
    </>}
    <p><Link href="/login">Back to sign in</Link></p>
  </main>;
}
