# V1 Milestone 5: Recurring expenses

Open http://localhost:3000/recurring, or choose Recurring in the header. The existing local commands remain `npm.cmd run dev:db`, `npm.cmd run dev:api`, and `npm.cmd run dev:web` in separate terminals. No new dependencies, environment variables, or schema migrations are required. The existing RecurringExpense model and occurrence uniqueness constraint are reused.

## Behavior

- Create monthly, weekly, or yearly rules with category, exact decimal amount, local start/end dates, notes, and optional equal split.
- Browse rules in 20-row pages, edit them, or deactivate with confirmation. Inactive rules retain their history.
- Select Generate due expenses and confirm to catch up through today in that rule's stored timezone. Saving a rule itself does not generate records.
- Generated expenses appear in Transaction History with a Recurring indicator. They have the occurrence date and local time 00:00:00; the rule does not model a time of day.
- Generation handles up to 100 occurrences per request. If more remain, the response and UI say to generate again.
- The backend calculates shares using the existing exact decimal rules. The frontend displays the returned values.
- Monthly schedules retain the original day: Jan 31 -> Feb 28 -> Mar 31. Yearly Feb 29 schedules use Feb 28 in non-leap years and return to Feb 29 in leap years. End dates are inclusive.
- A row lock serializes edits and generation. Transaction insertion and next-due advancement commit atomically; the unique rule/occurrence constraint is an additional safeguard. Repeat and concurrent calls cannot duplicate an occurrence. Deleting an already generated transaction does not rewind the cursor or regenerate it.
- Edits never rewrite generated transactions. New values apply to subsequent generation, including overdue occurrences not yet generated. After generation, start date, frequency, and timezone are fixed; deactivate and create a replacement rule to change the schedule. Amount, split, category, name, notes, and end date remain editable.

## REST API

| Endpoint | Behavior |
| --- | --- |
| `POST /recurring-expenses` | Create rule; returns 201 and saved rule |
| `GET /recurring-expenses?limit=20&offset=0` | Active first, then next due ascending; `{data, limit, offset}` |
| `PATCH /recurring-expenses/:id` | Partial edit, including `{is_active:false}` for deactivation |
| `POST /recurring-expenses/:id/generate` | Empty JSON object; `{created, has_more, rule}` |

Create fields: `name`, `category_id`, `total_amount` (decimal string), `frequency` (`monthly`, `weekly`, `yearly`), `start_date`. Optional: `end_date`, `time_zone` (defaults to configured server timezone), `is_split`, `participant_count`, `notes`. Browser creation sends the browser timezone. Responses include server-calculated `my_share`, `next_due_date`, `is_active`, and `schedule_locked`. Server-owned monetary and occurrence fields are rejected in input. Inactive generation returns 409; missing rules 404; invalid fields/category/date/split combinations 400.

No scheduler/cron is installed: generation is an explicit user action. Inactive rules can be reactivated through PATCH, retaining their existing cursor and catching up outstanding dates; the UI currently exposes deactivation only. History edits remain available through the existing transaction endpoints. No recurring-rule deletion endpoint is provided.

## Important files

- `apps/api/src/recurring/domain.ts`: validation and calendar stepping.
- `apps/api/src/recurring/routes.ts`: rule operations and atomic generation.
- `apps/api/src/app.ts`: route registration.
- `apps/web/src/components/recurring-ledger.tsx`: list, form, and confirmations.
- `apps/web/src/app/recurring/page.tsx`: recurring page.
- `apps/web/src/lib/api.ts`: shared REST request helper.
- `apps/api/test/recurring.test.ts`, `test/integration/recurring.test.ts`, and `apps/web/e2e/expenses.spec.ts`: calendar, database, and browser tests.

## Acceptance checks

1. Add Rent, INR 14,000, monthly, with a due start date; generate and check its occurrence in history.
2. Add WiFi, INR 1,500, split between 3; confirm INR 500 my share and INR 1,000 recoverable in generated history.
3. Generate the same rule again; confirm zero duplicates.
4. Edit the rule amount; confirm existing transactions keep their original amounts.
5. Deactivate; confirm generation is unavailable and history remains.
6. Test Jan 31 monthly dates across February, an inclusive end date, and a future start date.

Automated verification commands: `npm.cmd test`, `npm.cmd run test:integration`, `npm.cmd run test:web`, `npm.cmd run test:e2e`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`. Database/browser tests use disposable PostgreSQL, not your personal database.

Verification passed: 12 backend unit tests, 18 integration tests including their two enclosing tests, 9 frontend tests, and 5 Chromium browser scenarios. Both applications pass type-check, lint, and production build. Desktop/mobile screenshots were visually inspected; the live frontend `/recurring` and API list endpoint both returned HTTP 200. Browser verification covered create, persistence after reload, split generation, duplicate prevention, rule editing with preserved history, deactivation, and the existing M4 flows. Previews are in `Docs/verification/m5-recurring-desktop.png` and `m5-recurring-mobile.png`.

Milestone 6 dashboard/analytics, AI, and natural-language entry are not included.
