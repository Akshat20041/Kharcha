"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient, authEnabled } from "../lib/auth";

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter(); const sending = useRef(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => {
    if (!authEnabled) return;
    try {
      const { data } = authClient().auth.onAuthStateChange((event, session) => { if (session) router.replace(event === "PASSWORD_RECOVERY" ? "/reset-password" : "/"); });
      return () => data.subscription.unsubscribe();
    } catch { /* The submit handler displays configuration errors. */ }
  }, [router]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (sending.current) return;
    sending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const client = authClient();
      const result = signup
        ? await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/login` } })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword("");
      if (result.data.session) router.replace("/");
      else setMessage("Check your email for a confirmation link, then return here to sign in. If the account already exists, use Sign in.");
    } catch (failure) {
      const code = (failure as { code?: string }).code;
      setError(code === "invalid_credentials" ? "Email or password is incorrect."
        : code === "email_not_confirmed" ? "Confirm your email before signing in."
        : code === "over_email_send_rate_limit" || code === "over_request_rate_limit" ? "Too many attempts. Please wait and try again."
        : failure instanceof Error ? failure.message : "Couldn’t sign in. Please retry.");
    } finally { sending.current = false; setBusy(false); }
  }
  return <main className="auth-card" id="main-content"><p className="eyebrow">YOUR KHARCHA</p><h1>{signup ? "Create your account" : "Welcome back"}</h1>
    {!authEnabled ? <><p>This installation is in local mode.</p><Link href="/">Open your ledger</Link></> : <form onSubmit={submit}>
      <p>{signup ? "A private place for your everyday expenses." : "Sign in to your personal ledger."}</p>
      <div className="field"><label htmlFor="auth-email">Email</label><input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></div>
      <div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 8 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></div>
      {signup && <p className="field-hint">Use at least 8 characters. Your password is handled by Supabase.</p>}
      {error && <p className="error-box" role="alert">{error}</p>}{message && <p className="saved-notice" role="status">{message}</p>}
      <button className="button primary" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
      {!signup && <p><Link href="/forgot-password">Forgot password?</Link></p>}
      <p>{signup ? "Already have an account? " : "New to KharCha? "}<Link href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create account"}</Link></p>
    </form>}
  </main>;
}
