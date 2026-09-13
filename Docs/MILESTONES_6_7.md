# V1 Milestones 6 and 7

## Dashboard

Open http://localhost:3000/dashboard. Transactions remain at `/`; recurring expenses remain at `/recurring`. Shared navigation connects all three pages.

The dashboard shows variable personal spending, generated recurring personal spending, total personal spending, total paid, recoverable amount, daily variable average, and variable spending by category. Add Expense uses the existing form and refreshes the summary after saving. Month controls support previous, next, selected, and current month. Refresh and returning focus to the tab reload data. Empty months show explicit empty states and zero totals; failed refreshes hide old figures so they cannot be mistaken for current results.

### Financial definitions

- Variable spending: sum of `my_share` for `expense_nature=variable`.
- Fixed/recurring spending: sum of `my_share` for generated recurring transactions. Ungenerated rules do not contribute.
- Total personal spending: variable plus recurring personal spending.
- Total paid: sum of `total_amount` for both expense kinds.
- Recoverable: sum of `recoverable_amount`. V1 does not track settlements.
- Categories: variable `my_share`, ordered highest first. Recurring expenses are excluded.
- Average: variable personal spending divided by calendar days, rounded half-up to two decimal places. Current month uses elapsed days including today; past months use their full length, including leap days; future months return null and display a dash.

The entire selected month is included, even when a future-dated transaction has already been recorded. The average uses that same month's variable total and the denominator described above. Transaction dates are authoritative; `created_at` never determines the month. The requested timezone determines today's date and the current-month average denominator, not reinterpretation of stored transaction dates.

### API and implementation

`GET /dashboard?month=2026-09&time_zone=Asia%2FKolkata`. Both fields are optional: month defaults to the current local month, timezone to backend configuration. Invalid months/timezones return 400. Response fields are `month`, `today`, `time_zone`, `currency`, `average_days`, `transaction_count`, `variable_spending`, `recurring_spending`, `effective_spending`, `total_paid`, `recoverable`, `daily_variable_average`, and `categories` (`id`, `name`, `spending`). Money is exact decimal strings, except the null future average.

PostgreSQL groups/sums all matching transactions in a repeatable-read snapshot. Backend decimal arithmetic combines subtotals and computes the average. No transaction-history page limit applies. The frontend only formats results. Responses use `Cache-Control: no-store`. No schema changes or migrations are needed.

Important files:

- `apps/api/src/dashboard.ts`: validation, calendar boundaries, aggregated REST endpoint.
- `apps/api/src/app.ts`: registration.
- `apps/web/src/components/dashboard.tsx`, `src/app/dashboard/page.tsx`: dashboard UI.
- `apps/web/src/components/site-header.tsx`: shared accessible navigation.
- `apps/web/src/app/globals.css`: responsive totals, category list, month controls, touch targets.
- `apps/web/src/components/expense-form.tsx`, `recurring-ledger.tsx`, and `src/lib/api.ts`: polish to form errors and request messages.
- Backend dashboard unit/integration tests and frontend browser acceptance tests.

## M7 polish

Shared navigation has an accessible name and current-page indication. Mobile navigation wraps instead of overflowing. Edit/delete actions have 44px minimum height. Dashboard month input and icon buttons have accessible labels. Form API errors are focusable and receive focus; expense validation retains inline messages. Existing native dialogs preserve focus, support Escape, confirm destructive actions, and block dismissal while mutations are pending. Loading, empty, retry, save progress, and unavailable states remain part of the UI. User-facing setup/category messages avoid implementation instructions.

## Run and verify

Keep the existing commands in separate root terminals: `npm.cmd run dev:db`, `npm.cmd run dev:api`, `npm.cmd run dev:web`. No additional installation is needed. A running dev API reloads the new endpoint automatically; restart it if using a compiled server.

Manual acceptance example in an otherwise empty month:

1. Add a 2,000 normal expense and a 2,000 expense split between two people.
2. Generate a 14,000 recurring expense for that month.
3. Dashboard should show variable 3,000, recurring 14,000, personal 17,000, paid 18,000, recoverable 1,000. Variable category spending must total 3,000.
4. For July (31 days), daily variable average should be 96.77.
5. Edit or delete a transaction, return to Dashboard, and verify updated totals. Navigate to an empty month and verify zero values.
6. Stop the backend and refresh: an error with Retry appears without stale summary figures. Restart and retry.
7. Check mobile navigation and month controls; open Add Expense, press Escape, and confirm keyboard focus returns to its button.

Run `npm.cmd test`, `npm.cmd run test:integration`, `npm.cmd run test:web`, `npm.cmd run test:e2e`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`. Run commands that regenerate Prisma sequentially: concurrent generation writes to the same generated directory.

Verification completed: 13 backend unit tests, 19 integration tests (including enclosing tests), 9 frontend tests, and all 6 Chromium scenarios passed. Both applications passed type-check, lint, and production build. The dashboard browser test and frontend build were rerun after the final mobile month-control adjustment and passed. Known-value checks cover personal 17,000 / paid 18,000 / recoverable 1,000, recurring exclusion from averages/categories, more than 20 records, timezone and leap-year boundaries, mutations, empty months, and API failure recovery. Desktop/mobile screenshots were visually inspected. Live `/dashboard` frontend and API requests returned HTTP 200. Previews: `Docs/verification/m6-dashboard-desktop.png` and `m6-dashboard-mobile.png`.

V1 remains a local personal-use application. No authentication, AI, natural-language entry, imports, settlements, or V2 features were added. Recurring generation remains manual as in M5. Browser coverage uses Chromium with desktop/mobile viewport checks, not physical-device or Safari testing.
