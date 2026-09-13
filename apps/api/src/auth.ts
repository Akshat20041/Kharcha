import { createClient } from "@supabase/supabase-js";
import type { Config } from "./config.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { LOCAL_USER_ID, requireUserId, type IdentityResolver } from "./identity.js";
import { ApiError } from "./transactions/domain.js";

export function supabaseIdentity(config: Config, db: PrismaClient, fetcher: typeof fetch = fetch): IdentityResolver {
  const client = createClient(config.SUPABASE_URL!, config.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetcher(input, { ...init, signal: AbortSignal.timeout(8000) }) },
  });
  return async (request) => {
    const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization ?? "");
    if (!match || match[1]!.length > 16384) throw new ApiError(401, "Please sign in to continue.");
    // getUser contacts our configured Supabase Auth server to verify the token.
    // Never trust decoded claims or a browser-supplied user object.
    let result: Awaited<ReturnType<typeof client.auth.getUser>>;
    try { result = await client.auth.getUser(match[1]); }
    catch { throw new ApiError(503, "Sign-in verification is temporarily unavailable. Please retry."); }
    if (result.error) {
      if (!result.error.status || result.error.status >= 500 || result.error.status === 429) {
        throw new ApiError(503, "Sign-in verification is temporarily unavailable. Please retry.");
      }
      throw new ApiError(401, "Your session is invalid or expired. Please sign in again.");
    }
    const user = result.data.user;
    if (!user || user.is_anonymous) throw new ApiError(401, "Please sign in with your email and password.");
    const id = requireUserId(user.id);
    if (id === LOCAL_USER_ID) throw new ApiError(401, "Invalid account identity.");
    const profile = await db.user.upsert({ where: { id }, update: {}, create: { id, time_zone: config.APP_TIMEZONE }, select: { time_zone: true } });
    request.userTimeZone = profile.time_zone;
    return id;
  };
}
