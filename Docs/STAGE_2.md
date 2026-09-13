# Stage 2: Multi-user data model

The backend now scopes financial data by server-resolved user identity. This stage prepares data isolation; it does not add sign-up, sign-in, Supabase token verification, public access or deployment.

## Identity and ownership

- `User.id` is a UUID with no generated default. It is intended to be the canonical Supabase user UUID when Stage 3 connects authentication. There are no passwords or duplicate provider identities in this model.
- `Transaction`, `RecurringExpense` and `GroqApiUsage` each require `user_id`, with restrictive foreign keys to `users`. New records have no implicit database owner default.
- Existing categories remain shared system definitions, maintained by the category seed. There is no category-write API or custom category feature in this stage.
- Excel exports are generated on demand; AI drafts and analytics are not persisted. Their underlying expense queries are scoped by user. Groq usage metadata is persisted with the requesting user's ID; prompts are not recorded in that table.
- Transaction ordering, recurring scheduling and usage history indexes begin with `user_id`. A composite foreign key requires generated transactions and their recurring rule to have the same owner. Occurrence uniqueness and all existing financial constraints remain in effect.

`buildApp` accepts a trusted server-side `resolveIdentity(request)` dependency. Its result populates request context before finance handlers run. Stage 3 will connect this to verified tokens. HTTP headers, query parameters and payload fields cannot select a user; strict payload schemas reject ownership fields. The resolver must return a valid UUID, or the request receives 401.

For the current local product, development/test mode without a resolver uses the fixed local UUID below. An explicitly supplied resolver never falls back if it returns no identity. Production mode has no default identity: finance routes return 401 until a trusted resolver is supplied. Health checks and CORS preflight remain available. This is not yet a publicly authenticated application.

Transaction lists/lookups/edits/deletes, row locks, recurring lists/edits/generation, dashboard totals, current and previous analytics periods, and all/range Excel exports include the user's ID in their database queries. Services that accept an identity require it explicitly. Another user's record is indistinguishable from a missing record (404).

Prisma Studio is a privileged local database administration tool, not a user-scoped application screen. It can view all owners. Keep its database access private.

## Migration and existing data

Migration: `apps/api/prisma/migrations/20260911000000_user_ownership/migration.sql`.

The migration creates one local user:

```text
00000000-0000-4000-8000-000000000001
```

It assigns every existing transaction, recurring rule and Groq usage record to that user, then makes ownership mandatory. It preserves record IDs, amounts, splits, dates, timestamps, categories, rule cursors and historical links. The SQL runs in a transaction; the three earlier migrations are unchanged. No financial records are removed.

When Stage 3 connects a real account, associating this local user's data with the chosen Supabase UUID needs an explicit migration decision. This stage does not silently claim it for a newly registered account.

This workspace's local database has already been migrated. Before applying it, private application-table snapshots were saved under ignored `backups/`; the final snapshot is `backups/stage2-before-ownership-1789135725860.json`. Every pre-existing table record was compared before/after, excluding only the new ownership column, and matched. This JSON snapshot contains personal data and is not a complete PostgreSQL backup or an app import format. Do not commit it.

For another checkout/database, keep your database backup, stop the API, and run from the root with PostgreSQL running:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:check
npm.cmd run dev:api
```

Restart an already running API and Prisma Studio after upgrading. The frontend and URLs remain the same. No new environment variables are needed; local use continues with `NODE_ENV=development` (also the default). Production mode intentionally requires verified identity integration in Stage 3, even when using compiled builds locally.

## Verification

The integration suite covers both A-to-B and B-to-A access attempts, including pagination, lookup, edit, delete, recurring edits/generation, dashboard totals, current/prior analytics, and the contents and totals of all/range Excel workbooks. It also tests spoofed identity fields/headers, missing or invalid identity, concurrent usage attribution, idempotent generation and cross-owner database constraints. A populated legacy schema tests exact preservation of all old values during backfill.

Local verification passed:

- 22 backend unit tests, 9 frontend unit tests, 34 integration tests and 9 Chromium browser tests.
- Lint and TypeScript checks for both apps; both production builds.
- Prisma validation; four migrations applied; database-to-schema diff reports no difference.
- All pre-migration application records match the private snapshot after adding ownership.
- The running local API returns HTTP 200 for health, transactions, dashboard, analytics, recurring expenses and Excel export.
- Git whitespace checks passed; no ignored files are tracked. Existing private backups remain ignored.

Important changed files: Prisma schema and the new migration; `src/identity.ts` and `src/app.ts`; transaction service/routes, recurring routes, dashboard, analytics, export data/routes and parser routes under `apps/api`; integration ownership tests and existing fixtures; README and this guide. No frontend code, dependency versions or environment variables changed. Existing GitHub CI commands already run the new tests.

Stage 3 authentication requires separate approval.
