# Stage 1: GitHub repository and CI foundation

Scope: the existing npm monorepo, repository documentation and automated validation. Application behavior, Prisma schema/migrations, dependencies and application environment variables are unchanged.

## Workflow

`.github/workflows/ci.yml` runs on every pull request, pushes to `main`, and manual dispatch. Its single `validate` job uses Ubuntu 24.04 and Node 24 from `.nvmrc`, with a 20-minute limit. Superseded runs for the same ref are cancelled.

The job runs, sequentially:

1. Checkout with credentials persistence disabled; set up Node and the npm download cache keyed by `package-lock.json`.
2. `npm ci` and `npm run db:generate`.
3. `npm run db:validate`, `npm run lint`, `npm run typecheck`.
4. `npm test` and `npm run test:web`.
5. `npm run test:integration` (including applying the committed migrations twice to verify replay).
6. `npm run build` for both applications.
7. `npx playwright install --with-deps chromium` and `npm run test:e2e`.

The job has only `contents: read` permission. Checkout and setup-node use verified commit pins from their official v6 tags. Refer to the official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) documentation when updating them.

No repository secrets, real database or Groq account are required. The dummy `DATABASE_URL` is only for Prisma configuration; port 1 deliberately has no database. Integration and browser fixtures create PostgreSQL clusters with random passwords/ports in `.test-postgres/`, apply migrations and stop their clusters afterward. Browser tests use synthetic data and a mock provider on ports 3310/3311. CI never runs `db:migrate` against the application database or `test:groq:live`. No deployment or financial-data artifacts are published.

## Initial GitHub setup

At implementation time, this checkout is on `main`, with the Stage 0 files staged, no commits/tags and no remote. Leave the existing staged snapshot intact to create the Stage 0 checkpoint first. These commands assume that state still holds; inspect it before proceeding:

```powershell
git status
git diff --cached --stat
git diff --cached --check
git commit -m "chore: freeze working local product"
git tag -a v1.0.0-local -m "Stable local KharCha: V1, V2, V3 and Excel export"

git add .github/workflows/ci.yml README.md Docs/STAGE_1.md
git diff --cached --check
git commit -m "ci: add GitHub validation and repository setup"
```

If Git asks for an identity, configure your chosen commit name/email before retrying. If the Stage 0 commit/tag already exists, skip creating it again.

On GitHub, create an empty repository named `kharcha` under your account (private is a suitable default). Do not initialize it with a README, license or gitignore because this checkout already has source files. Replace `YOUR_USERNAME` below:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/kharcha.git
git push -u origin main
git push origin v1.0.0-local
```

Authenticate through Git's normal GitHub login prompt. Do not put an access token in the remote URL. If `origin` already exists, inspect `git remote -v` and use the correct existing remote instead of adding another.

In the repository's Actions tab, confirm **CI / Lint, types, tests and builds** passes on the initial push. If repository or organization policy disables Actions or restricts actions, enable this workflow and allow the two pinned official actions. Do not add database credentials or a Groq key to GitHub Actions.

To verify the pull-request trigger, make the next small change on a feature/fix branch, push it and open a PR targeting `main`. Confirm the same validation job appears on the PR. A successful local run does not certify the hosted Ubuntu run; that remains pending until the repository is pushed.

## Branch workflow

Keep `main` as the working baseline. Use `feature/short-description` for additions and `fix/short-description` for fixes:

```powershell
git switch main
git pull --ff-only
git switch -c feature/short-description
# Make and verify the approved change, then stage its specific files and commit.
git push -u origin feature/short-description
```

Open a PR to `main`, review its diff and wait for CI before merging. No GitFlow, deployment integration or branch-protection configuration is introduced in this stage.

For a new machine, clone the repository and follow [README local setup](../README.md#first-time-setup). Environment files, personal database files and exports remain local; cloning restores source, not financial records.

## Verification

Local verification on Windows with Node 24.13.0/npm 11:

- Clean source copy: `npm ci --offline --no-audit --no-fund` installed 576 packages from the existing npm cache; no lockfile changes.
- Prisma generation/validation, lint, both type checks and both production builds passed using the workflow's dummy URL and no Groq key.
- Backend unit tests: 22 passed. Frontend unit tests: 9 passed. PostgreSQL integration tests: 25 passed, including migrations, analytics, recurring expenses and Excel exports.
- Browser suite: 9 passed, covering expense CRUD, mobile views, AI confirmation, analytics, recurring expenses, export and failure handling.
- Clean source copy without any environment files or generated client: type checks and production builds passed after allowing Prisma's engine download through the local sandbox. The original browser run required cleanup of its sandbox-blocked test server; all assertions and its final exit status passed. A second browser run in the clean copy with normal process permissions also passed all 9 tests and exited successfully.
- Workflow YAML parsed successfully; PR/main triggers and read-only permissions checked. Official action commit pins verified with GitHub. Staged/unstaged whitespace checks passed; no tracked ignored files or common token/private-key pattern matches found.

These checks do not execute GitHub Actions itself. The first hosted Ubuntu push/PR run requires the manual GitHub setup above. Existing dependency deprecation/advisory notes from Stage 0 remain; this stage did not change dependency versions or introduce an audit gate.

Stage 2 (multi-user data model) requires separate approval.
