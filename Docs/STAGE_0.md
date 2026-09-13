# Stage 0 — local product checkpoint

Audit date: **2026-09-11**. Source of truth: [Scalable_further_Plan](Scalable_further_Plan) (the supplied roadmap exists under this extensionless filename, not `Scalable_further_plan.md`). Stage 0 only; no authentication, ownership changes, deployment, CI/CD, refactors or new product features.

## Checkpoint status

The source is ready for an initial Git commit and subsequent GitHub hosting as a **local single-user application**. It is not an internet-ready multi-user service. This directory does not yet contain `.git`; there is no existing index/history to inspect or untrack. No commit, tag, remote or GitHub repository was created. The commands below complete the requested checkpoint; the tag does not exist until they are run.

## Verification

| Check | Result |
| --- | --- |
| Backend unit tests | 22 passed |
| Frontend unit tests | 9 passed |
| Chromium browser acceptance suite | 9 passed, including all-record/range Excel downloads |
| PostgreSQL integration tests | 25 passed, including export/recurring/analytics |
| Prisma validation | Valid |
| Migration status | All three migrations applied; database up to date |
| Migration file checksums | All three match applied database history; none rolled back |
| Type-check, lint, production builds | Both apps passed |
| Live Groq | Five samples passed; no database writes |
| Local running services | Frontend, health, recurring list, monthly analytics and Excel export returned HTTP 200 |
| XLSX response | Correct MIME type and ZIP workbook content; integration tests reopen and check worksheets/formulas/charts |
| Dependency manifests | All three package manifests match package-lock dependencies |

The tests use isolated PostgreSQL databases; existing personal expenses and actual environment files were not changed.

## Source and secret audit

A temporary Git repository outside this project was used to evaluate the project's `.gitignore` against the first-commit candidate files. This did not initialize Git in the project. Candidate text was checked for provider/GitHub key patterns, private keys, JWTs, and the actual configured Groq key without printing secret values. No matches were found. This is a scoped local audit, not a guarantee against every possible secret format; there is no historical Git content here to scan.

The final temporary staging check included 101 source/documentation files, passed `git diff --cached --check`, included all four export modules, and verified that the staged SQL migrations retain byte-for-byte identity with their applied files. Private/generated paths were excluded.

Confirmed excluded: local `.env` files, dependencies, generated Prisma client, Next build directories/types, test databases, persistent `.local-postgres`, reports, screenshots, XLSX/CSV exports, backups and common private key files. `.env.example` files, application source and SQL migrations remain included.

Important fix: an unanchored `exports/` ignore pattern would also hide `apps/api/src/exports`. It is now `/exports/`, and all four Excel export backend modules are explicitly verified as included. Generated `Docs/verification/` files are kept on disk but excluded from commits because reports/screenshots may contain personal finance data. Tests regenerate the synthetic sample workbook.

All three environment examples were reviewed. Backend Groq key is blank; frontend exposes only the API URL. Example database passwords are now explicit `CHANGE_ME_LOCAL_ONLY` placeholders. No actual local environment file was overwritten. README documents every current user-facing environment variable, safe copy commands, database startup, migrations/seeding, Studio, three-terminal startup, production builds and tests.

## Files changed

- `.gitignore`: generated/private-file exclusions, anchored output folders and generated Next types.
- `.gitattributes`: consistent source line endings; SQL migration bytes excluded from conversion to preserve applied checksums.
- `.env.example`: explicit Docker database password placeholder.
- `apps/api/.env.example`: matching connection placeholder and explanatory comment.
- `README.md`: current local setup, environment table, feature scope, database location, port conflicts, data-vs-code backup distinction and verification commands.
- `Docs/STAGE_0.md`: audit results and checkpoint instructions.
- `Docs/Scalable_further_Plan`: removed a trailing blank line only; roadmap instructions unchanged.

No application behavior, Prisma schema, SQL migration, package version or dependency was changed during Stage 0. `apps/web/.env.example` was verified and needed no change.

## Known issues and limits

- `npm audit` still reports **3 high and 2 moderate entries**, representing two underlying advisories: development-only Prisma/deepmerge-ts recursion exhaustion and ExcelJS's uuid dependency buffer API issue. These were recorded, not hidden or automatically fixed by a potentially breaking dependency downgrade. See [deepmerge-ts advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) and [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). This is not a zero-advisory or public-deployment security approval.
- Native Excel visual rendering remains unverified in desktop Excel/LibreOffice, which is not installed here. XLSX functional/structure checks and download checks are separate from that limitation.
- Groq account/model availability can change. Normal tests remain independent of the live provider.
- Git restores source and migration history, not credentials or personal database contents. Preserve `.local-postgres` and private configuration separately. Never delete the database to make the Git tree clean.
- No clean-clone installation on a second machine was performed. Manifests/lockfile agree, builds succeed, and isolated integration tests initialize databases from the included migrations and seeds.

## Recommended Git commands

Run from the same audited project root. Configure a Git author name/email first if none exists; a GitHub noreply email can be used. Do not force-add ignored environment/database/report files.

```powershell
cd D:\New_idea
git init -b main
git add .
git diff --cached --check
git diff --cached --stat
git status --short
```

Review the staged file list. It should include `apps/api/src/exports` and all three SQL migrations; it must not include `.env`, `.local-postgres`, `node_modules`, `.next`, or `Docs/verification`. Then:

```powershell
git commit -m "chore: freeze working local KharCha product"
git tag -a v1.0.0-local -m "Stable local checkpoint: V1-V3 and V5 Excel export"
git status --short
git show --stat --oneline v1.0.0-local
```

`git status --short` should be empty after the commit. Package versions remain unchanged; the annotated Git tag identifies this checkpoint. Do not replace an existing tag with `-f`.

To inspect/restore the code checkpoint later without disturbing your active branch:

```powershell
git switch -c restore/local-checkpoint v1.0.0-local
```

Follow README setup, using private configuration and a preserved database or a fresh database initialized by the committed migrations. No GitHub remote/push or CI setup belongs to this stage. Stage 1 is the next recommended stage, only after approval.
