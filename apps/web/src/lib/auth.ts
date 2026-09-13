import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export const authEnabled = process.env.NEXT_PUBLIC_AUTH_MODE === "supabase";
export function authClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("sb_secret_")) throw new Error("Sign-in is not configured. Add the Supabase project URL and public key, then restart the frontend.");
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
  return client;
}

export async function authorizedFetch(url: string, init: RequestInit = {}) {
  if (!authEnabled) return fetch(url, init);
  const { data, error } = await authClient().auth.getSession();
  if (error || !data.session) {
    window.dispatchEvent(new Event("kharcha:unauthorized"));
    throw new Error("Please sign in to continue.");
  }
  const userId = data.session.user.id;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  const response = await fetch(url, { ...init, headers });
  const current = await authClient().auth.getSession();
  // Discard responses started by an account that has since signed out/switched.
  if (current.data.session?.user.id !== userId) throw new Error("Your account changed. Please retry.");
  if (response.status === 401) window.dispatchEvent(new Event("kharcha:unauthorized"));
  return response;
}
