import type { NextConfig } from "next";
import { validatePublicAuthKey } from "./src/lib/auth-config";

const authMode = process.env.NEXT_PUBLIC_AUTH_MODE ?? "local";
if (process.env.VERCEL === "1") {
  if (authMode !== "supabase") throw new Error("Vercel deployments require Supabase authentication");
  for (const name of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const) {
    const value = process.env[name];
    if (!value || !URL.canParse(value) || new URL(value).protocol !== "https:" || new URL(value).origin !== value) throw new Error(`Vercel requires a valid HTTPS origin for ${name}`);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error("Vercel requires a Supabase public key");
}
if (!["local", "supabase"].includes(authMode)) throw new Error("Invalid NEXT_PUBLIC_AUTH_MODE");
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (authMode === "supabase") validatePublicAuthKey(publicKey);
if (publicKey?.startsWith("sb_secret_")) throw new Error("Supabase frontend configuration requires a public key");
if (publicKey?.startsWith("eyJ")) {
  try {
    const payload = JSON.parse(Buffer.from(publicKey.split(".")[1] ?? "", "base64url").toString()) as { role?: string };
    if (payload.role !== "anon") throw new Error();
  } catch { throw new Error("Supabase frontend configuration requires a public anon key"); }
}

const nextConfig: NextConfig = {
  // Browser-test fixtures import the API. They belong to the full typecheck,
  // not the independently deployed frontend's production build.
  typescript: { tsconfigPath: process.env.NODE_ENV === "production" ? "tsconfig.build.json" : "tsconfig.json" },
  distDir: process.env.KHARCHA_E2E === "1" ? ".next-e2e" : ".next",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
};

export default nextConfig;
