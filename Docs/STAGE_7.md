# Stage 7: measured scalability and lightweight monitoring

The separate Next.js frontend and Node/Fastify API remain unchanged architecturally. No new finance features, queues, caches, services, API versions or database migrations are introduced. The existing local frontend loading-message edit is excluded from this release.

## Domain boundaries

| Domain | Implementation |
| --- | --- |
| Authentication/identity | `auth.ts`, `identity.ts`; verified UUID enters request context |
| User settings | `profile.ts` |
| Categories | `categories/routes.ts`; extracted from transaction routing |
| Transactions | `transactions/domain.ts`, `service.ts`, `routes.ts` |
| Recurring | `recurring/domain.ts`, `routes.ts` |
| Analytics | `dashboard.ts`, `analytics.ts`; PostgreSQL grouping, Decimal totals |
| Expense interpretation | `expense-parser/`; provider cannot persist transactions |
| Excel exports | `exports/`; bounded user-owned data, workbook and chart rendering |
| Cross-cutting operations | `observability.ts`, rate limits, configuration and database lifecycle |

Small focused modules can remain single files. Moving every file into a directory would add churn without changing the boundaries. Recurring and exports deliberately reuse transaction calculation/serialization rather than duplicating financial rules.

## Query and index review

Run `npm.cmd run check:query-plans` from the repository root. It replays all migrations in a newly created disposable PostgreSQL cluster, inserts 100,000 synthetic transactions for 100 users, runs ANALYZE, and emits `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for first-page history, offset 800, monthly dashboard and yearly analytics. CI runs the same review. It never reads production credentials or resets the local ledger. This is a controlled query-plan sample, not production load testing or a concurrency/hosting-capacity guarantee.

The existing `(user_id, transaction_date DESC, transaction_time DESC, id DESC)` index matches history's owner filter and deterministic ordering and provides the owner/date prefix for dashboard, analytics and exports. No current transaction list endpoint filters by expense nature or category, so additional `(user_id, category_id)` or `(user_id, expense_nature)` indexes have no demonstrated need. Preserve category FK indexes, recurring occurrence uniqueness, recurring `(user_id, is_active, next_due_date)` and usage `(user_id, created_at DESC)` indexes. The recurring list has mixed sort directions and a final ID sort; revisit that plan if rule counts become material. Do not treat the existing recurring index as a perfect match for every sort.

Measured on the local PostgreSQL 17 synthetic fixture on 2026-09-19 (warm cache, 1,000 transactions per user):

| Query | Observed plan | Execution time |
| --- | --- | --- |
| First 20 history rows | Existing owner/date/time/ID index scan; 20 rows read | 0.032 ms |
| Offset 800, next 20 | Same index via bitmap scan plus sort; 1,000 owner rows read | 1.079 ms |
| Monthly dashboard | Same index via owner/date bitmap scan; 88 rows aggregated | 0.146 ms |
| Year analytics | Same index via bitmap scan; 1,000 rows reduced to 365 daily groups | 1.233 ms |

These are SQL execution times, not end-to-end API timings. The deeper offset clearly reads more rows, but this sample does not justify an immediate cursor/UI migration. No new index or materialized analytics table is added. Re-run with representative distributions before a future performance change.

## Pagination and analytics

Transactions and recurring lists already apply server-side `take`/`skip`, default 50 and maximum 100; the frontend requests 20 history rows. Transactions order by date, time and unique ID. Existing integration tests verify ownership and page bounds. Retain the offset contract and page UI for now. Inserts/deletions between pages can shift an offset page; this is not snapshot pagination. If deep-page latency becomes material, add a backwards-compatible cursor with the date/time/ID tuple and owner-scoped predicates before migrating the UI. A cursor must never establish user identity.

Dashboard and analytics use PostgreSQL group/aggregate queries in repeatable-read snapshots. Analytics reads grouped day/nature/category totals, not every transaction, and bounds custom ranges to 366 days. Decimal money calculations remain on the backend. Precomputed totals and cross-request caches are not justified; avoiding them also avoids invalidation and cross-user leakage risks.

## Work that could need a worker later

- Excel exports fetch at most 20,001 rows to reject requests above 20,000. Workbook/chart generation still uses API memory/CPU and is synchronous. Watch export latency, process memory and overlapping requests. If repeated large exports cause timeouts or memory pressure, add a user-owned job record and bounded worker with expiring private downloads, not a public file URL. Recheck ownership at submission, processing and download; never retry financial writes just because a download failed.
- Recurring generation processes at most 100 occurrences per request inside a 15-second transaction, with row locking and a unique rule/occurrence key. `has_more` supports catch-up. If measured lock waits or timeouts persist, move batches to a worker preserving those constraints and the verified user identity.
- Imports and notifications are not implemented. If later approved, reuse these boundaries and make retries/idempotency explicit. No worker or queue is introduced by this stage.

## Error tracking and slow endpoints

The API emits one completion event per request: `request_completed`, `slow_request` (warning), or `request_error` for any 5xx (error). Events include `reqId`, method, route template, status and latency, plus authenticated user UUID when available. `slow` also flags slow failures. Unexpected errors include a separate `error_detail` event with a safe error code under the same request ID; count only `request_error` for error rates to avoid double counting.

Default slow threshold is 1,000 ms; optional backend `SLOW_REQUEST_MS` accepts 1–120,000. No frontend variable or new secret is needed. Keep `LOG_LEVEL=info` for routine latency/error-rate review; warn/error levels suppress normal completions. Logging tests verify that raw URL parameters, payload markers and connection strings are absent. Do not add raw stack traces, headers or provider messages to fix a diagnostic gap.

In Render Logs, search `request_error`, then correlate `reqId` with the browser's `X-Request-Id` and `error_detail`. For slow routes search `slow_request` or `"slow":true` and compare by route template. Review 5xx rate and p95 latency over a representative window before adding indexes/caches. Investigate repeated 5xx immediately and repeated slow responses on history/analytics before changing the threshold. These structured logs provide basic error tracking, not a durable external exception dashboard; provider retention limits still apply. Add a redacted log drain/error tracker later if usage warrants long retention or proactive error-rate alerts.

## Availability monitoring

`.github/workflows/uptime.yml` runs the existing public deployment probe hourly at minute 23 UTC and supports manual dispatch. It checks API liveness, login HTML, authenticated-route boundaries, CORS and headers. Each request permits up to 90 seconds for a cold start. It sends no finance writes, uses no secrets and does not attempt to keep Render awake: the one-hour interval allows normal free-tier sleeping.

Open GitHub Actions → **Production availability** for the history. In your GitHub notification settings → Actions, enable email/web notifications for failed workflows. GitHub sends scheduled-workflow notifications to the schedule's owner/editor; confirm receipt on your own account. No Slack/email messages are sent by application code. A failed check is visible in Actions even if notifications are disabled.

This is hourly synthetic availability, not a continuous SLA or database-readiness check. GitHub schedules can be delayed or disabled after prolonged repository inactivity. A passing `/health` does not establish database connectivity, Auth/Groq availability, or two-account correctness. Use the Stage 5 authenticated checklist and Stage 6 backup/restore procedures. No backup guarantee or successful restore drill is implied by this stage.

Deployment: merge only after required CI passes. Vercel deploys the frontend; Render must have **After CI Checks Pass** enabled or be manually deployed to the merged commit. Defaults require no environment edits. After Render finishes, verify `/health` and inspect request events in Logs. Run **Production availability** once manually and confirm its successful run. Stage 8 is not started.

References: [Fastify elapsed time](https://fastify.dev/docs/latest/Reference/Reply/), [GitHub workflow notifications](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs), [scheduled-workflow limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
