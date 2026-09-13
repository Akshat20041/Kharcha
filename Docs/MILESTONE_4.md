# V1 Milestone 4: Basic Expense UI

The mobile-first expense ledger supports adding normal, equal-split, and historical expenses; viewing newest-first history; editing every requested field; and deleting with confirmation. Categories come from the API. Loading, empty, validation, progress, and API error states are included. Failed writes preserve the form; successful writes display backend-returned amounts. Duplicate clicks are blocked while saving or deleting.

## Architecture and files

The existing applications remain separate: Next.js/React/TypeScript/Tailwind in `apps/web` communicates over REST with Node.js/TypeScript/Fastify in `apps/api`, which persists through Prisma to PostgreSQL. React state is sufficient for this milestone. The frontend validates input and formats decimal strings without performing split/accounting calculations. New expenses default to the browser's local date, time, and timezone; edits preserve the saved timezone and historical date/time.

- `apps/web/src/components/expense-ledger.tsx`: history, pagination, mutation results, confirmed deletion.
- `apps/web/src/components/expense-form.tsx`: shared add/edit form, split fields, validation and progress.
- `apps/web/src/components/dialog.tsx`: modal focus and busy-state behavior.
- `apps/web/src/lib/{api,types,expense}.ts`: REST access, contract types, input validation and formatting.
- `apps/web/src/app/{page,layout}.tsx` and `globals.css`: application entry and responsive layout.
- `apps/web/test/expense.test.ts`: frontend unit tests.
- `apps/web/e2e/` and `playwright.config.ts`: browser acceptance tests using a disposable PostgreSQL cluster and real API.
- Workspace package scripts: frontend tests, browser tests, and Prisma Studio.

No production API endpoints, contracts, financial rules, schema, or migrations changed. The only backend package change adds the Studio script. A stop endpoint exists exclusively in the isolated browser test fixture to simulate an actual outage; it is never registered by the application server.

## Run locally (PowerShell)

Prerequisites: Node.js 24.x, npm 11+, and Docker Desktop with Linux containers, or PostgreSQL installed locally. Run from `D:\New_idea`. Use `npm` instead of `npm.cmd` outside PowerShell.

Alternatively, run `npm.cmd run dev:db` in a separate terminal instead of the Docker command below. This starts bundled PostgreSQL using your local API database settings and persists records in `.local-postgres/`. Keep that terminal open and restart it when you resume development. Docker or a system PostgreSQL installation is not needed for this option.

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
if (!(Test-Path apps/web/.env.local)) { Copy-Item apps/web/.env.example apps/web/.env.local }
docker compose up -d --wait db
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:check
```

For an existing PostgreSQL installation, create the `kharcha` database and set `DATABASE_URL` in `apps/api/.env`; omit the Docker command. See `.env.example` files for connection settings. Do not use `db push`, because migrations also install database constraints.

Start each command in its own root terminal:

```powershell
npm.cmd run dev:api
```

```powershell
npm.cmd run dev:web
```

```powershell
npm.cmd run db:studio
```

| Application | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| REST API | http://localhost:3001 |
| Health | http://localhost:3001/health |
| Prisma Studio | http://localhost:5555 |

Studio connects directly to the database configured in `apps/api/.env`. Open its model selector to inspect Transaction, Category, and RecurringExpense rows. RecurringExpense remains schema only. Studio edits bypass the API, so use the expense form to change financial values. Ctrl+C stops each process. `docker compose stop db` stops PostgreSQL while retaining its data.

## Verification

Executed successfully for this milestone:

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Both applications pass |
| `npm.cmd run lint` | Both applications pass |
| `npm.cmd test` | 10 backend unit tests pass |
| `npm.cmd run test:web` | 6 frontend tests pass |
| `npm.cmd run test:integration` | 13 integration cases plus enclosing test pass |
| `npm.cmd run test:e2e` | 3 Chromium acceptance scenarios pass |
| `npm.cmd run build` | Backend and frontend production builds pass |
| `npm.cmd run db:studio` | Starts successfully on port 5555 |

Install the test browser once with `npx.cmd playwright install chromium`. Browser tests reserve ports 3310/3311, start a fresh seeded PostgreSQL cluster, and delete that cluster afterward. They never reset the application database. Windows execution must allow test processes to start and stop child servers. Screenshots are stored in `Docs/verification/`.

## Manual acceptance checklist

These flows were exercised through scripted Chromium interactions against the real API/PostgreSQL, with desktop/mobile screenshots visually inspected. Repeat the checklist on your local application database:

- [x] Add INR 500, Dinner, Food & Dining. Confirm paid 500, share 500, recoverable 0.
- [x] Add INR 1,200 with equal split, 4 participants. Confirm paid 1,200, share 300, recoverable 900.
- [x] Add INR 600 for September 5, 2026 at 8:30 PM. Reload and confirm the date/time and notes persist.
- [x] Edit a 500 expense to 600. Toggle split on/off and confirm backend-calculated shares update.
- [x] Cancel a deletion, then confirm it. Reload and confirm the deleted expense stays absent.
- [x] Refresh and confirm saved transactions remain in history.
- [x] Stop the backend with an expense draft open. Saving shows an error and retains the draft. Reloading shows an unavailable state, not an empty ledger.
- [x] Submit an empty form; confirm field errors and focus. Delay a save; confirm disabled controls prevent duplicate submissions.
- [x] Verify desktop history and mobile cards/form at 390px width without horizontal overflow.

## Limits and scope

### Transaction history refinement

History now groups records by `transaction_date`, with days and transaction times descending. Each group shows personal spending (sum of returned `my_share`), paid (sum of `total_amount`), and non-zero recoverable amounts. Sums use integer minor units for exact decimal-string aggregation; individual split calculations remain in the backend. Date is shown once in the group header, while rows retain time, category, money, split indicators, and editing/deletion.

The existing 20-transaction pagination and API are unchanged. Summaries cover **only records on the current page**, explicitly stated above the groups and in each group's record count. A day spanning pages has separate subtotals on each page; these must not be interpreted as complete daily totals. No extra requests fetch the rest of a day.

Relevant files: `apps/web/src/lib/day-groups.ts`, `src/components/expense-ledger.tsx`, `src/app/globals.css`, `test/day-groups.test.ts`, and `e2e/expenses.spec.ts`. Verification includes the requested 3,000 personal / 4,000 paid / 1,000 recoverable example, a separate 1,234 normal-expense day, exact decimal sums, and a 21-record day across two pages. Browser fixtures use October dates to isolate them from existing September acceptance data.

The permanent local PostgreSQL service must be installed/configured separately; automated checks used disposable PostgreSQL. Studio startup was checked, but browsing rows against a permanent application database was not verified. Browser coverage is Chromium; physical-device/Safari/Firefox checks remain manual. History uses 20-row pages; with exactly 20 final records, Next may lead to an end-of-list page because the existing API does not return a total count. An ambiguous network failure after saving should be followed by a history refresh before retrying.

No recurring-expense functionality, dashboard, analytics, natural-language entry, AI, or authentication is included. Milestone 5 has not started.
