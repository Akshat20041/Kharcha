# Stage 6: CI/CD and deployment reliability

Scope: predictable releases, migration safety and backup/recovery procedures. No schema, application endpoints, financial logic or Stage 7 refactoring changes.

## Normal release

1. Branch from current `main` (`feature/*` or `fix/*`). Make the change, run relevant tests, push the branch and open a PR.
2. CI runs the full existing validation plus the migration-history guard and its tests. It uses disposable databases and no production credentials. Review the PR release checklist.
3. Require **Lint, types, tests and builds** to succeed with the branch up to date before merging. Protect `main` against direct pushes, force pushes and deletion, including administrators. Require resolved conversations. For this solo-owner repository a PR is required but the approval count is zero; destructive database changes still require explicit owner approval recorded in the PR. Add a second reviewer and require one approval when collaborating.
4. Merge the tested PR. Vercel's existing Git integration deploys `apps/web` from `main`. The protected merge is Vercel's gate: Vercel itself can begin before the separate main-branch CI rerun finishes. Do not bypass branch protection or manually deploy untested commits. No paid Vercel deployment-check feature is assumed.
5. Render deploys `main` only after CI checks pass (`autoDeployTrigger: checksPass`). Confirm both hosts show the intended commit and a successful deployment. Frontend and API deploy independently; preserve their contract across mixed versions.
6. Run GitHub Actions **Verify production → Run workflow** after both hosts finish, or:

```powershell
npm.cmd run check:deployment -- https://kharcha-web-eta.vercel.app https://kharcha-api-zg7j.onrender.com
```

The public check verifies liveness, login HTML, protected-route 401s, CORS and security headers. It does not verify database readiness or authenticated CRUD: sign in, open history, add/edit/delete a test expense, and check the affected feature. Keep the Stage 5 two-account checklist for changes to ownership/authentication. The smoke workflow is intentionally manual, never scheduled as a free-service keep-alive, and not a predeploy CI dependency (which could make Render wait on itself).

## One-time host settings

- GitHub: Settings → Branches → protect `main` as above. The required check name must match the CI job exactly. No production secrets are added to GitHub Actions.
  The exact solo-owner configuration is in `.github/main-protection.json`. An authenticated repository administrator can apply it with `gh api --method PUT repos/Akshat20041/Kharcha/branches/main/protection --input .github/main-protection.json`. Review existing protection first; this command replaces those fields.
- Render: API service → Settings → Build & Deploy → Auto-Deploy → **After CI Checks Pass**. Keep branch `main`, root at repository root, existing build/start commands and `/health`. Services created manually do not automatically consume `render.yaml`; Blueprint-managed services must sync the change. Verify the new setting in the dashboard.
- Vercel: retain GitHub integration, production branch `main`, Root Directory `apps/web`, and current production public environment variables. PR previews are build previews only unless separate preview backend/auth origins are configured; do not allow all origins on production.
- Supabase: retain disabled Data API and verified TLS. Establish the backup arrangement below before relying on the service for external users.

## Production migrations: a separate, reviewed operation

CI prevents modification/deletion of any previously committed migration file or lock file. New migration directories must sort after history. Schema changes require a new migration; the guard is deliberately conservative even for schema-file comment changes. The guard cannot prove SQL is safe. Integration tests replay migrations on disposable PostgreSQL; review generated SQL and test upgrades against a private restored copy when existing data is affected.

For every database change:

1. Record the migration names, SQL review, data/lock risks, compatible old/new app versions, deployment order and recovery procedure in the PR. Never edit applied migrations or their checksums. Drops, truncations, narrowing types, data deletions and rewrites require explicit written owner approval before execution; an ordinary CI pass is not approval.
2. Prefer expand/contract releases: add backwards-compatible fields/tables, migrate while the old app still works, deploy compatible code, backfill separately if necessary, and remove old structures only in a later approved release. Avoid coupling a frontend release to an API change that may not yet be live.
3. Take and verify a private backup as described in [BACKUPS.md](BACKUPS.md). Rehearse restoration before destructive work. Record the backup timestamp, migration commit and current deployed commits; do not attach backups or secrets to a public PR.
4. **Before merging** code that needs new schema, check out the exact reviewed PR commit in a separate local worktree, install locked dependencies, and generate Prisma. Configure the ignored `apps/api/.env.production` for the intended project (see Stage 5). Apply compatible migrations with:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:prepare:production -- --confirm-project=trzbezqlnmxxhlxkzbso
```

This existing command confirms the target, requires TLS and Data API acknowledgement, runs `prisma migrate deploy`, and seeds reference categories only. It never imports development expenses. Use only the reviewed migration commit: do not apply unrelated pending migrations. Record success in the PR, then merge. Future automation must retain this explicit review/compatibility boundary; migrations remain outside builds and startup.

5. If the change cannot be compatible with the running app, stop automatic deployments on both hosts, arrange a maintenance window and prevent writes before the approved migration. Resume deployments only after schema and both app versions are verified. No destructive operation is performed as part of Stage 6.

## Failure diagnosis and rollback

- CI failure: inspect the failing step, fix on the PR, rerun the full check. Never bypass the required check. An edited historical migration must be restored byte-for-byte and replaced with a new forward migration.
- Render build/start failure: compare commit IDs, inspect Events/build/runtime logs, configuration and `/health`. Health is liveness only; a 200 does not prove the database is connected. Do not print tokens/DB URLs when sharing logs.
- Vercel failure: inspect deployment logs and the frontend workspace/public environment configuration. Public-variable changes require a rebuild.
- Migration failure: stop release progression. In a shell with the intended hosted `DATABASE_URL` set privately (ordinary `.env` remains local), run `npx.cmd prisma migrate status` from `apps/api`. Inspect `_prisma_migrations` (`migration_name`, `started_at`, `finished_at`, `rolled_back_at`, `logs`) privately and compare actual schema/data with SQL. Prisma DDL may have partially applied unless that migration used a transaction. Do not retry blindly or use `db push`, reset, delete history, or `migrate resolve` to hide an unexplained failure. Use a reviewed repair/forward migration; use `resolve` only after an operator has verified and documented the actual outcome.
- App rollback: select the last known-good deployment in each provider, **only if compatible with the current schema**. Pause auto-deploy while investigating; Render's specific-commit dashboard deploy disables auto-deploy. Revert the offending code through a tested PR before reenabling automation. Reverting Git does not reverse database changes.
- Data loss/corruption: pause writes and deployments, preserve the current DB privately, restore the chosen backup into an isolated target, validate it, then plan a controlled cutover with the same user identity mapping. See the backup guide; restoring production is an explicitly approved incident operation and may lose writes since the backup.

## Backup responsibility and limits

Supabase Free is not a recoverability guarantee. [BACKUPS.md](BACKUPS.md) gives a manual application-schema dump and isolated restore drill, and links the provider's full-project procedure. No scheduled production backups, paid plan or storage destination are silently configured. Before meaningful external usage, choose provider-managed daily backups/PITR or encrypted scheduled off-site backups with monitored failures and regular restore drills. This remains an operator setup item until enabled and verified.

Sources checked for this implementation: [Render CI deploy gates](https://render.com/docs/deploys), [Blueprint setting](https://render.com/docs/blueprint-spec), [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [Supabase backup capabilities](https://supabase.com/docs/guides/platform/backups).

Stage 7 (scalability refactor) is not started.
