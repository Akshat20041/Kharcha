# Stage 3: Authentication and authorization

Email/password sign-up, sign-in, sign-out, persisted sessions, protected app screens and minimal profile settings are implemented using Supabase Auth. PostgreSQL finance data stays in the existing local database behind the Fastify REST API.

## Account setup

1. Create a Supabase project. Keep its database password private; this stage does not use its hosted database for finance records.
2. Enable Email under Authentication Providers. With email confirmation enabled, confirm the email before signing in.
3. In Authentication URL Configuration, set Site URL to `http://localhost:3000` and allow `http://localhost:3000/login` as a redirect URL. Use the same browser for signup and confirmation with the PKCE flow. If confirmation opens elsewhere, return to the app and sign in with the confirmed email/password.
4. Copy the project URL and publishable key (a legacy anon key also works). Never use a secret/service-role key in the frontend.

In `apps/api/.env`:

```dotenv
AUTH_MODE=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

In `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Keep `DATABASE_URL`, `GROQ_API_KEY`, `NEXT_PUBLIC_API_URL` and other existing values. Restart API/frontend after environment changes; public frontend settings are also embedded at build time.

For a fresh checkout, run `npm.cmd ci`, `npm.cmd run db:generate`, `npm.cmd run db:migrate` and `npm.cmd run db:seed`, with the local database running. Start the API and frontend using the README commands. Open `/signup`, confirm the email and sign in. Settings are at `/settings`.

Official references: [email/password flows](https://supabase.com/docs/guides/auth/passwords), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [server-side getUser verification](https://supabase.com/docs/reference/javascript/auth-getuser).

## Server authority and session behavior

Every protected REST request, including XLSX downloads, sends `Authorization: Bearer <access-token>`. The API uses Supabase's `auth.getUser(token)` against the configured project. It does not trust decoded JWT claims, a client session object or browser-supplied user IDs. Rejected tokens return 401; Auth availability failures return 503 without falling back to the local account. The SDK on the server does not persist or refresh user sessions.

A verified UUID provisions a minimal `User` row if needed. Financial operations retain Stage 2's ownership filters. All finance/category/profile routes require identity; health and CORS preflight remain available without it. Passwords are submitted directly to Supabase, not stored in PostgreSQL or handled by KharCha's API.

The browser SDK persists and refreshes the session. Protected components wait for session restoration and the API profile before mounting. They remount when the account changes, preferences are reset, and responses started by a different account are discarded. Signing out clears the app view and redirects to login. Supabase controls access-token expiration and refresh-token revocation; the application does not invent its own token store or JWT verifier.

The frontend uses client-side route protection because financial data is fetched exclusively from the authenticated API. Static page HTML contains no private finance data. No Next.js API routes, Server Actions or browser database queries are introduced.

## Local mode

The examples retain `AUTH_MODE=local` / `NEXT_PUBLIC_AUTH_MODE=local` for the existing private ledger until Supabase is configured. Both sides must match. Local mode uses the fixed Stage 2 identity only in development/test. Production never accepts the local fallback. Keep configured Supabase mode enabled when using accounts; local mode is not a public authentication alternative.

The current workspace's two environment files are configured for Supabase. A read-only check confirmed matching project URLs/keys, reachable Auth settings, enabled email/signup and required email confirmation. No private key values were printed or committed.

## Profile

`GET /me` returns the signed-in account's ID, display name, timezone and currency. `PATCH /me` accepts only display name, a valid IANA timezone and `INR`. Currency remains INR because existing calculations and exports support INR only. Ownership fields and unsupported currencies are rejected.

Saved timezone is used for new expense defaults, quick entry and analytics, including backend defaults when the request omits a timezone. Existing expense timestamps and recurring schedules remain unchanged. Profile data belongs to the canonical Supabase UUID; there is no second provider ID or password table.

Migration `20260911010000_user_profile` adds these fields and makes the recurring ownership foreign key deferrable for the explicit administrative transfer below. Normal writes still check it immediately. Earlier migration files are unchanged. The local database has all five migrations applied with no Prisma schema drift.

## Existing local expenses

New accounts start empty. No signup automatically receives the legacy ledger.

After signing in, copy the Account ID from Settings. Keep a private database backup and stop financial writes while transferring. From the root, first preview the counts:

```powershell
npm.cmd run data:transfer -- ACCOUNT_UUID
```

After checking the destination, apply:

```powershell
npm.cmd run data:transfer -- ACCOUNT_UUID --confirm
```

This command is administrative and has no HTTP endpoint. It requires an existing account row, locks the affected tables and moves only the fixed local user's transactions, recurring rules and Groq usage in one transaction. Existing record IDs, dates, amounts and updated timestamps are preserved. Repeating it reports zero remaining local records. It cannot move another real account's records. Keep Supabase mode enabled afterward, and refresh the app/Studio.

The existing local ledger has been transferred to the user's uniquely matching signed-in profile. Eight transactions, two recurring rules and one Groq usage record were transferred; record counts, ownership and fingerprints of every other field were verified. A private pre-transfer snapshot is saved in ignored `backups/before-akii-transfer.json`. It is an application-data snapshot, not a full PostgreSQL backup.

## Verification

Normal integration tests use disposable PostgreSQL clusters. New Auth integration tests run the official SDK against a local test-only Auth service, covering missing/forged/expired/wrong-project/rejected tokens, provisioning, profile isolation, ownership and the atomic legacy transfer.

`npm.cmd run test:e2e` verifies the existing local-mode product. `npm.cmd run test:e2e:auth` runs signup, email-confirmation messaging, login errors, persisted/refreshing sessions, logout, authenticated exports, profile settings and account switching through the real SDK and local fixture. Both use isolated synthetic data; ports 3310/3311/3312 must be available. No real email or Groq calls are made. GitHub CI runs both suites and builds the authenticated frontend using dummy public configuration, with no GitHub secrets.

Verification passed: 22 backend unit tests, 9 frontend unit tests, 38 PostgreSQL integration tests, 9 local-mode browser scenarios and 3 authenticated browser scenarios. Lint, both type checks, Prisma validation and both production builds passed; the authenticated frontend also builds with CI's dummy public configuration. All five local migrations are applied and schema diff reports no difference. The live project settings endpoint responds successfully, the local API rejects unauthenticated expense requests with 401, and the running frontend redirects protected pages to login. Environment files/backups remain ignored, and the source secret-pattern audit found no matches.

Important files: `apps/api/src/auth.ts`, `profile.ts`, `transfer-local-data.ts`, the identity/config hooks and new profile migration; frontend auth provider/forms, authenticated request helper, Settings and preference handling; API and browser Auth fixtures/tests; environment examples, package/lock files, README and CI workflow. No Stage 4 work or deployment is included. Existing dependency advisories remain unchanged.

The user's profile exists and the local ledger transfer is verified. The final real-project check still requires two confirmed accounts using separate browser sessions; verify each sees only its own records across transactions, dashboard, recurring expenses and exports. Automated fixture results do not substitute for that account-side check.

Stage 4 security hardening and deployment remain out of scope.
