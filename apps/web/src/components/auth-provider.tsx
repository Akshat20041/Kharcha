"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { authClient, authEnabled } from "../lib/auth";
import { loadProfile } from "../lib/load-profile";
import { setPreferences, type Profile } from "../lib/preferences";

const AuthContext = createContext<{ profile: Profile | null; updateProfile: (profile: Profile) => void }>({ profile: null, updateProfile: () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(!authEnabled);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const pathname = usePathname(); const router = useRouter();
  const publicPage = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(pathname);
  useEffect(() => {
    if (!authEnabled) return;
    let active = true;
    let unsubscribe = () => {};
    try {
      const client = authClient();
      const { data } = client.auth.onAuthStateChange((event, next) => {
        if (!active) return;
        setSession(next); setLoaded(true);
        if (event === "PASSWORD_RECOVERY") router.replace("/reset-password");
      });
      unsubscribe = () => data.subscription.unsubscribe();
      // INITIAL_SESSION is delivered by the SDK after persisted-session recovery.
    } catch (failure) { queueMicrotask(() => { if (active) { setError((failure as Error).message); setLoaded(true); } }); }
    const expired = () => {
      setSession(null); setProfile(null); setPreferences(null); setError("");
      router.replace("/login");
      void authClient().auth.signOut({ scope: "local" }).catch(() => {});
    };
    window.addEventListener("kharcha:unauthorized", expired);
    return () => { active = false; unsubscribe(); window.removeEventListener("kharcha:unauthorized", expired); };
  }, [router]);
  const userId = session?.user.id;
  useEffect(() => {
    const online = () => { setError(""); setRetry((value) => value + 1); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  useEffect(() => {
    if (!authEnabled) return;
    let active = true;
    const controller = new AbortController();
    const slow = setTimeout(() => { if (active) setConnecting(true); }, 5000);
    setPreferences(null);
    if (userId && !publicPage) {
      void loadProfile(controller.signal, () => { if (active) setConnecting(true); }).then((value) => {
        if (active) { clearTimeout(slow); setConnecting(false); setPreferences(value); setProfile(value); setError(""); }
      }).catch(() => { if (active && !controller.signal.aborted) {
        clearTimeout(slow);
        setError(navigator.onLine ? "Your account could not be loaded right now. Please retry in a moment. Your saved expenses are safe." : "You appear to be offline. Reconnect to the internet; we will try again automatically.");
      } });
    }
    return () => { active = false; clearTimeout(slow); controller.abort(); };
  }, [userId, retry, publicPage]);
  async function signOut() {
    setSigningOut(true);
    try {
      const result = await authClient().auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      setError(""); setProfile(null); setPreferences(null); router.replace("/login");
    } catch { setError("Could not sign out. Check your connection and try again."); }
    finally { setSigningOut(false); }
  }
  useEffect(() => {
    if (authEnabled && loaded && !session && !publicPage && !error) router.replace("/login");
  }, [loaded, session, publicPage, error, router]);
  if (authEnabled && !publicPage) {
    if (error) return <main className="auth-card" id="main-content"><h1>Couldn’t open your account</h1><p role="alert">{error}</p><div className="export-actions"><button className="button primary" disabled={signingOut} onClick={() => { setError(""); setConnecting(false); setRetry((value) => value + 1); }}>Retry</button><button className="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button></div></main>;
    if (!loaded || !session || profile?.id !== userId) return <main className="auth-card" id="main-content"><h1>Opening your account</h1><p role="status">{connecting ? "Connecting to your account. This can take about a minute after some time away. We will retry automatically." : "Restoring your session and loading your account…"}</p></main>;
  }
  return <AuthContext.Provider value={{ profile: profile?.id === userId ? profile : null, updateProfile: (value) => { setPreferences(value); setProfile(value); } }}>
    <div key={publicPage ? "public-auth" : authEnabled ? userId ?? "signed-out" : "local"}>{children}</div>
  </AuthContext.Provider>;
}
