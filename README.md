# KharCha

A local, single-user expense tracker with manual and Groq-assisted expense entry, equal splits, recurring expenses, analytics and formatted Excel export.

Implemented: V1, V2, V3 and **V5 Excel export only**, plus ownership isolation, Stage 3 Supabase authentication and Stage 4 request/configuration hardening. V4, imports and CSV export are deferred. Deployment has not begun. See the [Stage 4 environment reference, security limits and remaining dependency findings](Docs/STAGE_4.md) before preparing a public beta.

Requirements: [PRD](Docs/PRD.md). Next-phase source of truth: [scaling roadmap](Docs/Scalable_further_Plan). Product checkpoint: [Stage 0](Docs/STAGE_0.md). Repository setup and CI: [Stage 1](Docs/STAGE_1.md).

## Architecture

Cloud deployment preparation: [Stage 5 setup and public-beta checklist](Docs/STAGE_5.md). Root `render.yaml` configures the API; `apps/web/vercel.json` configures the frontend. Hosting/account setup and public verification must finish before the beta tag.

- `apps/web`: Next.js, React, TypeScript and Tailwind; consumes the REST API.
- `apps/api`: separate Fastify/Node.js/TypeScript backend; owns validation, exact money calculations, recurring generation, analytics, Groq calls and Excel generation.
- PostgreSQL with Prisma. Models: User, Category, Transaction, RecurringExpense and GroqApiUsage. Five SQL migrations include constraints beyond the Prisma schema.

No Next.js API routes or Server Actions serve as the backend. Personal spending uses `my_share`; total paid includes money paid for others. Groq extracts draft fields; backend rules calculate money, and confirmation is required to save.

Financial records belong to a user. Supabase handles email/password accounts; the separate API verifies bearer tokens and scopes every financial operation. See [Stage 3 setup, environment variables and legacy-data transfer](Docs/STAGE_3.md). Existing local records stay under their fixed local identity until explicitly transferred to your chosen account.

## Monorepo layout

Monorepo layout (one root npm lockfile):

```text
.github/workflows/ci.yml  # PR and main validation
apps/api/                # Fastify REST API, scripts and tests
  prisma/                # Schema, SQL migrations and category seed
apps/web/                # Next.js frontend, unit and browser tests
Docs/                    # Requirements, roadmap and setup notes
package.json             # Workspace commands
package-lock.json        # Locked dependencies for both apps
```

## Prerequisites

- Node.js **24.x**, npm **11+**; `.nvmrc` and package engines record these requirements.
- Git to create/restore the checkpoint.
- Chromium for browser tests: `npx.cmd playwright install chromium`.
- No Docker or separate PostgreSQL installation is required for the bundled local database or isolated tests. Alternatively use PostgreSQL 17 or Docker Desktop with Compose.

Commands use PowerShell and `npm.cmd` to avoid execution-policy issues with `npm.ps1`. Run them from your actual project root; this workspace is `D:\New_idea`. `D:\New\_idea` is a different folder. Other shells can use `npm` and equivalent copy commands.

## First-time setup

For a fresh checkout, run `git clone https://github.com/YOUR_USERNAME/kharcha.git`, then `cd kharcha` (replace the owner/repository with yours). Run the following commands from that checkout; the `cd` below is only for this existing local workspace.

```powershell
cd D:\New_idea
npm.cmd ci
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
if (!(Test-Path apps/web/.env.local)) { Copy-Item apps/web/.env.example apps/web/.env.local }
```

Before initializing a fresh database, replace `CHANGE_ME_LOCAL_ONLY` in the backend connection with your local password. URL-encode special characters in the password portion. Existing installations must retain their existing credentials and `.local-postgres` directory; do not overwrite them with examples.

Terminal 1 — persistent local database (keep open):

```powershell
npm.cmd run dev:db
```

In another root terminal, initialize/verify the database:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:check
```

Migrations and category seeding are repeatable and preserve expenses. Do not substitute `prisma db push` or migration reset: explicit SQL migrations enforce financial constraints.

Terminal 2 — backend:

```powershell
npm.cmd run dev:api
```

Terminal 3 — frontend:

```powershell
npm.cmd run dev:web
```

Open **http://localhost:3000**. Backend: **http://localhost:3001**. Stop processes with Ctrl+C. After restarting the computer, start the database before the API/frontend.

## Environment variables

| File | Variables | Purpose |
| --- | --- | --- |
| `apps/api/.env` | `DATABASE_URL` | Required backend-only PostgreSQL connection |
| | `NODE_ENV` | development/test/production; defaults to development |
| | `HOST`, `PORT` | Defaults: `127.0.0.1`, `3001` |
| | `WEB_ORIGIN` | Default `http://localhost:3000`; exact origin, no trailing slash |
| | `LOG_LEVEL` | Default `info` |
| | `SLOW_REQUEST_MS` | Backend slow-request warning threshold; defaults to 1000 ms |
| | `APP_TIMEZONE` | IANA timezone; example `Asia/Kolkata`; host timezone if omitted |
| | `GROQ_API_KEY` | Optional backend-only secret; blank disables AI, not manual entry |
| | `GROQ_MODEL` | Default `qwen/qwen3.8-27b`; provider/account availability may change |
| | `AUTH_MODE` | `supabase` for accounts; `local` preserves the private development ledger and is never a production fallback |
| | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Required in Supabase mode; project URL and public publishable/anon key |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_URL` | Public API URL, normally `http://localhost:3001`; never a secret |
| | `NEXT_PUBLIC_AUTH_MODE` | Match the backend mode |
| | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same Supabase URL/public key; never a secret/service-role key |
| root `.env` (Docker only) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Container settings matching the backend connection |

Restart servers after environment edits. Frontend builds bake in the public API URL. Test-only `KHARCHA_E2E=1` selects a separate Next build directory; the browser fixture sets it automatically.

## Database and Prisma Studio

The bundled database persists in **`.local-postgres/` under the project root**. Do not delete or manually edit it. Tests use disposable `.test-postgres/run-*` clusters and never reset your application database.

```powershell
npm.cmd run db:studio
```

Open **http://localhost:5555** to view all five models. Studio has privileged access to all users' records; prefer the app for expense edits so calculations remain consistent. Restart Studio after schema changes. If port 5555 is occupied, use the existing Studio or stop its original terminal before starting another.

If port 5432 is occupied, `dev:db` checks the configured connection and reuses a healthy existing database. Do not stop unrelated services or delete their files. A failed connection means the running service and `DATABASE_URL` need checking.

Git restores code, **not expenses or credentials**. Back these up privately. Excel reports are not full database backups. For a cold copy of bundled PostgreSQL files, stop the API and database cleanly before copying `.local-postgres`; copying a running data directory is not a reliable backup. Docker stores its data in a named volume instead.

### Optional Docker/existing PostgreSQL

Use only one database method at a time. For Docker, copy root `.env.example` only if `.env` is missing, then set matching database credentials:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --wait db
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:check
```

Stop with `docker compose stop db` to retain the volume. For an existing PostgreSQL installation, create the database and set the backend connection before applying migrations.

## Verification and builds

Run sequentially to avoid concurrent Prisma generation:

```powershell
npm.cmd test
npm.cmd run test:web
npm.cmd run test:integration
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run test:e2e:auth
npm.cmd run test:groq:live
```

Normal tests use a mock Groq provider. The separate live check consumes provider usage for five fixed samples and never writes database records. Browser tests use ports 3310/3311 and `.next-e2e`; leave these ports available.

`GET /health` checks API liveness only. `npm.cmd run db:check` checks the database connection. Expense operations also require applied migrations and seeded categories.

After building, stop dev servers on the same ports and use separate terminals for compiled apps:

```powershell
npm.cmd run start --workspace @kharcha/api
```

```powershell
npm.cmd run start --workspace @kharcha/web
```

Prisma packages remain pinned together at 6.19.3. Known dependency advisories and verification limits are in the Stage 0 report; do not blindly run `npm audit fix --force` during this freeze.

## GitHub and CI

Use `main` for the working baseline, `feature/*` for additions and `fix/*` for fixes. Open a pull request into `main` and check CI before merging. See [Stage 1 setup](Docs/STAGE_1.md) for the initial commit/push commands and GitHub steps.

The [CI workflow](.github/workflows/ci.yml) installs locked dependencies with an npm download cache, validates Prisma, runs lint/type checks, backend/frontend unit tests, isolated PostgreSQL integration tests, production builds and Chromium browser tests. It runs on pull requests and pushes to `main`, and can also be started manually. No GitHub secrets are needed; tests use disposable databases and a mock Groq provider. The live Groq check remains opt-in locally.

Stage 6 adds committed migration-history protection and release-guard tests to CI. Follow the [release, migration and recovery runbook](Docs/STAGE_6.md): protected PRs into `main`, Vercel Git deployments, and Render **After CI Checks Pass**. Existing manually created Render services need that setting changed in the dashboard; editing the Blueprint alone does not reconfigure them. Run `npm.cmd run test:release` locally. Use the **Verify production** workflow after both deployments finish; it does not require secrets or send finance writes.

See [database backups and restore drills](Docs/BACKUPS.md) before a production migration. Database passwords and finance backups stay outside GitHub/CI. Application-schema backups do not include Supabase Auth; Excel exports are not disaster-recovery backups.

## Screens and supporting documentation

Stage 7 keeps the modular monolith and existing REST contracts. See [query/index review and monitoring](Docs/STAGE_7.md). `npm.cmd run check:query-plans` creates an isolated synthetic database and prints PostgreSQL plans; it never benchmarks or modifies your real database. The **Production availability** workflow checks the deployed app hourly, with failure notifications controlled by your GitHub Actions notification preferences.

- Transactions `/`: CRUD, splits, past dates, natural-language quick entry and Excel export.
- Accounts `/login`, `/signup`, `/settings`: Supabase authentication and profile preferences.
- Dashboard `/dashboard`: monthly totals/charts and manual Add Expense. Quick entry is on Transactions only.
- Recurring `/recurring`: explicit generation, pause/edit, idempotent occurrences and preserved history.
- Analytics `/analytics`: daily, weekly, yearly and custom ranges up to 366 days.
- Export: all records or an inclusive range; four-sheet XLSX with summaries/charts, up to 20,000 records.

See [transaction API](Docs/TRANSACTION_API.md), [recurring expenses](Docs/MILESTONE_5.md), [V2/V3](Docs/V2_V3.md), and [Excel export](Docs/V5_EXPORT.md). Generated workbooks/screenshots in `Docs/verification/` stay local and are excluded from the source checkpoint. Tests regenerate the sample workbook from synthetic data.
