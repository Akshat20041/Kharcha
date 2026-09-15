# Stage 5: Cloud deployment

Status: deployment files prepared for the user-created GitHub repository; public deployment and hosted two-account verification are pending hosting setup. Do not tag the beta until the checklist below passes. Stage 6 automation is not included.

## Hosting layout

- Supabase: existing Auth project plus its hosted PostgreSQL database.
- Render: separate Node 24 API service, repository root build, `apps/api` workspace, `/health`, `HOST=0.0.0.0`, platform-provided `PORT`.
- Vercel: Next.js frontend with project Root Directory `apps/web`, connected to the same GitHub repository, production branch `main`.
- Local PostgreSQL and existing personal finances stay local. This procedure creates reference categories only; it does not upload a local database or development transactions. The legacy identity row in migration history is inert in production.

## 1. Connect GitHub

Use the user-created repository [Akshat20041/Kharcha](https://github.com/Akshat20041/Kharcha), on branch `main`. The repository is public. `.env` files, `.local-postgres`, backups, exports and `.vercel` remain ignored; only source, examples, tests and configuration belong in Git. Check the existing CI workflow after each push. Do not create a beta tag yet.

## 2. Prepare Supabase safely

1. Open the existing project. Under API settings, **disable the Data API** before creating finance tables. The frontend uses Supabase Auth only. Database access goes through the separate API and Prisma; public table access must not bypass backend ownership checks. Leave Authentication enabled. See [Supabase's Prisma guide](https://supabase.com/docs/guides/database/prisma).
2. In Connect, copy the **Session pooler** URL (port 5432), with its exact project-specific username, and insert the database password using URL encoding. Use `sslmode=require` or a stricter validated TLS configuration. Do not use the transaction pooler on port 6543 for this setup. A direct connection works where IPv6 is available; session mode supports IPv4. Never disable certificate verification globally. [Connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. Keep this hosted URL out of your existing `apps/api/.env` so local development remains local. Create the ignored file `apps/api/.env.production` using the template below. It is used only by the explicit preparation command.

```dotenv
NODE_ENV=production
AUTH_MODE=supabase
APP_TIMEZONE=Asia/Kolkata
WEB_ORIGIN=https://YOUR_WEB_PROJECT.vercel.app
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:URL_ENCODED_PASSWORD@YOUR_SESSION_POOLER_HOST:5432/postgres?sslmode=require
SUPABASE_DATA_API_DISABLED=true
```

`SUPABASE_DATA_API_DISABLED` is an operator acknowledgement, not an API-setting toggle. Verify the setting in Supabase first. Do not copy a service-role key. Keep private credentials in this ignored file or provider secrets, never chat/GitHub.

4. Review the committed migration files. From the repository root, run:

```powershell
npm.cmd run db:generate
npm.cmd run db:prepare:production -- --confirm-project=YOUR_PROJECT_REF
```

This checks the project/connection, requires TLS and explicit acknowledgement, runs `prisma migrate deploy`, then idempotently seeds only reference categories. A failed migration stops the seed. No `db push`, reset or implicit startup migration is used. Run it once for this release; re-running is idempotent. Inspect failures before retrying; do not mark failed migrations resolved without understanding their state.

## 3. Deploy Render API

Connect Render to GitHub and import root `render.yaml` as a Blueprint. It declares a free Node web service with manual deploys. Review the plan before creation. Repository root must remain the monorepo root, not `apps/api`.

- Build: `npm ci --include=dev && npm run build --workspace @kharcha/api`
- Start: `npm run start --workspace @kharcha/api`
- Health: `/health`
- Node: 24.13.0; `HOST=0.0.0.0`; Render supplies `PORT` (do not set it to localhost's 3001).
- Supply `DATABASE_URL`, `WEB_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GROQ_API_KEY` in Render's environment settings. Use the same hosted connection as above. Blueprint supplies production mode, auth mode, timezone, log level and model.
- `WEB_ORIGIN` must be the exact final Vercel HTTPS origin, without a slash/path. If creating services before the final URL is known, update this before testing finance requests.
- After the controlled migration step, manually deploy and save the public API URL. Confirm `/health` works. No migration runs during builds, restarts or ordinary web requests.

See [Render Blueprint reference](https://render.com/docs/blueprint-spec). The free service intentionally avoids paid pre-deploy/shell features and synthetic keep-alive traffic.

The API currently ignores forwarded headers to prevent spoofing. Behind Render this can group requests under a proxy IP; per-user limits still remain independent. For this small beta the conservative aggregate limit remains in place. Before inviting wider usage, verify the actual proxy chain and configure a narrowly trusted proxy; do not blindly set `trustProxy=true` or trust a client-controlled header.

## 4. Deploy Vercel frontend

Import the GitHub repository. Choose Next.js, Root Directory **`apps/web`**, Node **24.x**, and include files outside the root directory. `apps/web/vercel.json` installs from the repository root and builds the frontend workspace. Use `main` as the production branch.

Set these **Production** environment variables, then deploy:

```dotenv
NEXT_PUBLIC_AUTH_MODE=supabase
NEXT_PUBLIC_API_URL=https://YOUR_API_SERVICE.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

No database URL, Groq key or private Supabase key belongs on Vercel. The build fails if Vercel is configured with local auth or non-HTTPS endpoints. Public variables are embedded during build, so changes require redeployment. See [Vercel monorepo setup](https://vercel.com/docs/monorepos).

The frontend production build uses `apps/web/tsconfig.build.json` to exclude browser-test helpers that import the backend. Full `typecheck` still checks those helpers after Prisma generation. CI builds the frontend before generating Prisma to guard against accidentally requiring backend generated files on Vercel.

Set Render `WEB_ORIGIN` to the final Vercel production origin and redeploy the API if it changed. In Supabase Authentication URL configuration, set Site URL to that origin and add the exact `https://YOUR_WEB_PROJECT.vercel.app/login` redirect URL. Keep localhost login redirects if you still use local development. Configure email delivery/confirmation for invited users; test both accounts' confirmation emails.

PR preview deployments can build with the same public auth configuration, but the production API deliberately rejects preview origins. Full interactive previews need a separate preview backend/database and exact redirect/origin configuration; they are deferred. Do not enable wildcard production CORS or auth redirects to make previews work.

Password recovery: add `https://kharcha-web-eta.vercel.app/reset-password` to Supabase's Authentication redirect allowlist (and `http://localhost:3000/reset-password` for local testing). Login links to `/forgot-password`; Supabase emails a PKCE link to `/reset-password`, where the verified session can set a new password and sign out. Open the email link in the same browser that requested it. Expired/used links require a new request. Configure Supabase email delivery for actual recipients; the application does not send mail itself. Copy complete public keys using Supabase's Copy button, never masked dots or shortened previews; malformed keys are rejected at build/startup.

## 5. Verify the public beta

Run this read-only smoke test after both hosts are live:

```powershell
npm.cmd run check:deployment -- https://YOUR_WEB_PROJECT.vercel.app https://YOUR_API_SERVICE.onrender.com
```

Then create two separate test accounts (A and B) and record results:

- [ ] Sign up, receive confirmation email, confirm, log in and log out.
- [ ] Refresh and reopen the browser; session restoration works.
- [ ] A creates, reads, edits and deletes an expense; creates an equal split and checks exact personal share.
- [ ] A creates a recurring rule and generates it twice; no duplicate occurrence appears.
- [ ] Dashboard and analytics agree with transaction dates and personal share.
- [ ] Natural-language parsing reaches Groq, records token metadata and requires review before saving.
- [ ] Excel download opens with correct totals, formatting, charts and selected date range.
- [ ] B sees no A expenses/rules/analytics/export data; direct A IDs requested with B's token return not-found, and updates cannot change A's records.
- [ ] After logout/login switching, no cached A records appear for B.
- [ ] Missing/invalid tokens return 401; invalid input returns 400; API/network failures preserve unsaved drafts and show useful errors.
- [ ] Mobile navigation, forms, dashboard and export work at a narrow viewport.
- [ ] Supabase Data API remains disabled; no public database access bypass exists.
- [ ] Review the Stage 4 dependency findings before inviting other users.

The public smoke test alone does not establish full Stage 5 completion. Tag `v2.0.0-beta` only on the verified deployed commit after the two-account checks pass.

## Free-tier limits and upgrades

Render may sleep and cold-start; first finance requests can time out and need Retry after the API wakes. Supabase has usage/storage limits and may pause inactive free projects. Free plans provide no production SLA, and quotas can change. Check [Render free limits](https://render.com/docs/free) and [Supabase pricing](https://supabase.com/pricing) before launch. Upgrade when cold starts, sustained traffic, storage, email delivery or backup requirements exceed a hobby beta. Do not add artificial keep-alive jobs. Stage 6 deployment automation and backup operations remain outside this stage.
