# V5 — Excel export only

In **Transactions → Export Excel**, choose all transactions or an inclusive From/Through date range, then select **Download Excel**. The export includes all matching records across pagination, not just the visible page. No imports, CSV support, or later-version features are included.

## Workbook

- **Summary:** green/teal/coral KPI panels for personal spending, total paid, recoverable, variable/recurring shares and transaction count. Two native Excel charts show the top eight categories and latest twelve recorded months.
- **Transactions:** complete transaction details, category/merchant, split fields, notes, IDs, recurring references, local date/time, timezone and UTC audit timestamps. Filterable Excel table, alternating row colours, frozen headers and identity columns, and INR number formats.
- **Categories:** personal spending, percentage, total paid, recoverable, variable/recurring shares and counts. Percentage cells use a colour scale.
- **Monthly:** the same spending measures grouped by actual transaction month. Only months containing records are listed; missing months have no transactions.

Dates are sortable ISO text so pre-1900 dates and local calendar values remain unchanged. Money is numeric for Excel analysis. Text beginning with `=`, `+`, `-`, or `@` is exported as text, not executed as a formula. Long notes remain complete in the cell and formula bar even when row height limits their visible display.

Backend calculations use Prisma Decimal. Summary formulas have backend-computed cached results and recalculate when opened in Excel. Formulas are bounded to the exported rows. Editing existing values in Excel changes workbook calculations, not the application. Re-export to include newly added rows or categories. Filtering transaction rows does not change summary totals. Recoverable is the original amount paid for others; repayments are not tracked.

## API and implementation

`GET /exports/expenses.xlsx` exports all records.

`GET /exports/expenses.xlsx?start_date=2026-09-01&end_date=2026-09-30` exports an inclusive date range.

Both dates must be supplied together. Invalid dates/reversed ranges return 400. The API returns an XLSX attachment with `Cache-Control: no-store`. It performs no writes and makes no Groq calls. A single database query supplies the rows and joined categories, so the workbook's detail and summaries describe the same result set.

Maximum: 20,000 transactions per export. Larger selections are rejected explicitly rather than truncated. Export currently supports INR; selections exceeding Excel's 15-significant-digit monetary precision are rejected instead of silently rounding away paise. Empty selections produce a valid workbook with zero totals and an explanatory message.

ExcelJS generates the workbook. A small JSZip/DrawingML module adds the two native Excel charts, including worksheet references and cached series. No database migration or environment variable is needed.

Important files:

- `apps/api/src/exports/data.ts`, `workbook.ts`, `charts.ts`, `routes.ts`
- `apps/web/src/components/export-expenses.tsx`, updated `expense-ledger.tsx`
- `apps/api/test/export-data.test.ts`, `test/integration/export.test.ts`
- `apps/web/e2e/expenses.spec.ts`

## Run and verify

Install updated dependencies with `npm.cmd install` if running another checkout. Restart the backend with `npm.cmd run dev:api`; keep the frontend running with `npm.cmd run dev:web`.

Checks:

```powershell
npm.cmd test
npm.cmd run test:integration
npm.cmd run test:web
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Integration tests reopen generated XLSX files and verify totals, dates, complete record counts, cached formulas, literal text safety, frozen panes, table structure, chart references, empty selections and invalid ranges. Browser tests exercise all-record and date-range downloads, expected filenames, errors, retained controls, and mobile layout. A sample workbook containing synthetic test data is saved at `Docs/verification/KharCha_sample_export.xlsx`.

Verified on 2026-09-10: 22 backend unit tests, 25 PostgreSQL integration tests, 9 frontend unit tests, and 9 browser scenarios passed. Both apps passed type-check, lint and production builds. The running local backend returned HTTP 200 with XLSX content at `/exports/expenses.xlsx`. Browser-runner cleanup required stopping its own test-server processes after all assertions passed; it then exited successfully. No user transactions were created or changed during verification.

Rendering limitation: Excel/LibreOffice is not installed in this environment. The verification script checks XML and can produce an approximate cell/style preview from the saved workbook; its screenshot write was blocked by permissions, and elevated approval was unavailable because of the session usage limit. Native chart rendering in desktop Excel is not yet visually verified.

Dependency audit: ExcelJS 4.4.0 brings a moderate advisory through uuid 8's v3/v5/v6 buffer APIs. The inspected ExcelJS code uses only v4 without a supplied buffer. No spreadsheet uploads or imports are accepted by this feature. Existing development-only Prisma advisories are unchanged. Do not use `npm audit fix --force` to downgrade the workbook library without retesting.
