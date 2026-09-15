"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { authClient, authEnabled } from "../lib/auth";
import { request } from "../lib/api";
import { setPreferences, type Profile } from "../lib/preferences";

const AuthContext = createContext<{ profile: Profile | null; updateProfile: (profile: Profile) => void }>({ profile: null, updateProfile: () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(!authEnabled);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
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
    if (!authEnabled) return;
    let active = true;
    setPreferences(null);
    if (userId && !publicPage) {
      void request<Profile>("/me").then((value) => {
        if (active) { setPreferences(value); setProfile(value); setError(""); }
      }).catch((failure: Error) => { if (active) setError(failure.message); });
    }
    return () => { active = false; };
  }, [userId, retry, publicPage]);
  useEffect(() => {
    if (authEnabled && loaded && !session && !publicPage && !error) router.replace("/login");
  }, [loaded, session, publicPage, error, router]);
  if (authEnabled && !publicPage) {
    if (error) return <main className="auth-card" id="main-content"><h1>Couldn’t open your account</h1><p role="alert">{error}</p><button className="button primary" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry</button><a href="/login">Back to sign in</a></main>;
    if (!loaded || !session || profile?.id !== userId) return <main className="auth-card" id="main-content" role="status">Opening your account…</main>;
  }
  return <AuthContext.Provider value={{ profile: profile?.id === userId ? profile : null, updateProfile: (value) => { setPreferences(value); setProfile(value); } }}>
    <div key={publicPage ? "public-auth" : authEnabled ? userId ?? "signed-out" : "local"}>{children}</div>
  </AuthContext.Provider>;
}
