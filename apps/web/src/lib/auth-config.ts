export function validatePublicAuthKey(key: string | undefined) {
  if (!key || !/^[A-Za-z0-9._-]+$/.test(key) || key.includes("...") || key.startsWith("sb_secret_")) {
    throw new Error("Sign-in configuration is invalid. Copy the full Supabase public key into NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and redeploy the frontend.");
  }
}
