# Database backups and restore drills

## Coverage and current status

The current documented deployment uses Supabase Free. Its paid plans provide daily backup retention and optional PITR; do not assume Free includes accessible daily restores. Verify the actual project's plan and backup page before relying on it. Supabase recommends regular off-site logical exports for Free projects. See [current backup capabilities](https://supabase.com/docs/guides/platform/backups).

The procedure below backs up **only the `public` application schema**: users/profiles, categories, transactions, recurring rules, Groq usage metadata, constraints/indexes and `_prisma_migrations`. It is a consistent database snapshot, not an Excel report. It does **not** include Supabase Auth users/password hashes/sessions, managed schemas/roles, project settings, secrets, storage objects, or code. Keep the matching Git commit and private configuration inventory separately. User UUIDs must remain aligned with Supabase Auth; recreating an email account usually creates a different UUID and does not restore ownership.

For full Supabase recovery, use the [provider's backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) or managed backups/PITR, including Auth and managed-role considerations. Do not restore a raw whole-project dump into another hosted project without that procedure. Storage objects and project configuration need separate coverage. Disabling the Data API must be reverified on a replacement project.

No production backup was taken or restored by Stage 6. PostgreSQL client tools were not installed on the development machine during implementation. The commands below require a first real restore drill before being counted as a verified backup strategy. Never store these files in GitHub artifacts, public PRs, Vercel or Render's ephemeral filesystem.

## Prerequisites

Install PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`, `createdb`) and add their `bin` folder to PATH. Use a client major version matching the server (or a supported newer client); `pg_dump` cannot dump a newer server major. Check the Supabase server version in its dashboard/SQL editor with `SHOW server_version;`. The embedded development database package does not include these backup clients.

Keep the public CA certificate at `backups/prod-ca-2021.crt` (download from Supabase if absent). Use the project's Session pooler on port 5432, not the transaction pooler. Passwords are entered interactively and never included in command arguments, command history or output. These examples run in PowerShell from the repository root.

## Manual application backup

Use a fresh private terminal. Replace the host and username with the exact values from Supabase Connect. This operation is read-only; normal app writes can continue during the snapshot.

```powershell
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path backups | Out-Null
$env:PGHOST = 'YOUR_SESSION_POOLER_HOST'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres.YOUR_PROJECT_REF'
$env:PGDATABASE = 'postgres'
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = (Resolve-Path backups/prod-ca-2021.crt).Path
$backupPath = Join-Path (Resolve-Path backups).Path ("kharcha-public-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')

pg_dump --password --format=custom --schema=public --no-owner --no-acl --file="$backupPath"
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Do not use the partial archive.' }
pg_restore --list "$backupPath" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Archive is unreadable.' }
(Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash | Set-Content -LiteralPath ($backupPath + '.sha256')
git rev-parse HEAD
Remove-Item Env:PGHOST,Env:PGPORT,Env:PGUSER,Env:PGDATABASE,Env:PGSSLMODE,Env:PGSSLROOTCERT
```

Record timestamp, project reference, server/client versions, deployed commits and migration status in a private backup inventory. An archive listing/checksum verifies readability/integrity only, not restorability. Encrypt the archive and inventory using your trusted backup tool and keep an off-site copy under restricted access. Treat them as private financial records. Keep encryption credentials separately, and periodically verify that both the archive and decryption credentials are usable. If a command fails, clear the PG environment variables or close the terminal before doing other database work.

## Restore drill: disposable local database only

Use a fresh terminal and a local PostgreSQL server on a known port. **Never point this drill at Supabase or your existing `kharcha` database.** The database name below is new for every drill; `createdb` fails if it exists. This process neither resets nor drops the existing database. Do not run migrations or seed before restoring the archive: it already contains schema and migration history.

```powershell
$ErrorActionPreference = 'Stop'
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432' # port of your local PostgreSQL instance
$env:PGUSER = 'postgres' # your local administrator
$env:PGSSLMODE = 'disable' # local loopback drill only
$env:PGDATABASE = 'postgres'
$restoreDatabase = 'kharcha_restore_' + (Get-Date -Format 'yyyyMMddHHmmss')
$backupPath = (Resolve-Path 'backups/REPLACE_WITH_ARCHIVE.dump').Path
$expectedHash = (Get-Content -LiteralPath ($backupPath + '.sha256')).Trim()
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash -ne $expectedHash) { throw 'Checksum mismatch.' }
createdb --password --template=template0 "$restoreDatabase"
if ($LASTEXITCODE -ne 0) { throw 'Could not create a fresh drill database; stop.' }
$env:PGDATABASE = $restoreDatabase
# --clean handles the default public schema in this newly created drill DB only.
pg_restore --password --dbname="$restoreDatabase" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction "$backupPath"
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; investigate this isolated database.' }
psql --password --set=ON_ERROR_STOP=1 --command='SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name;'
if ($LASTEXITCODE -ne 0) { throw 'Migration history verification failed.' }
psql --password --set=ON_ERROR_STOP=1 --command='SELECT count(*) AS transactions, sum(total_amount) AS paid, sum(my_share) AS personal, sum(recoverable_amount) AS recoverable FROM public.transactions;'
if ($LASTEXITCODE -ne 0) { throw 'Financial verification failed.' }
Remove-Item Env:PGHOST,Env:PGPORT,Env:PGUSER,Env:PGDATABASE,Env:PGSSLMODE
```

Compare row counts, money totals, user UUIDs, dates, constraints and recurring occurrence uniqueness with your private backup inventory. Use a separate worktree/private API configuration to test the matching app commit against this isolated restored DB, including two-account isolation and Excel totals. Do not reuse the live API or change its database URL to run a drill. Restored production data is sensitive even on localhost. Remove the disposable DB after the drill using its exact recorded name after verifying the target; do not use wildcard cleanup.

This drill restores application data only. For actual hosted recovery, pause writes/deployments, preserve the damaged database, restore to an isolated replacement using the Supabase procedure, verify Auth UUID mapping and Data API settings, test the full app, then approve a cutover. Never overwrite live data merely to test a backup. Never connect a local-auth bypass API containing restored user data to a public network.

## Ongoing backup strategy: required operator decision

Before external users depend on KharCha, enable and verify either:

- Provider-managed daily backups, with PITR if a day's data loss is unacceptable; check actual retention and restore a test copy.
- A daily scheduled, encrypted, off-site logical backup covering both application data and Auth, plus project configuration/storage where applicable. Run it from a trusted private runner with credentials in its secret store, retention controls and failure notifications. Do not commit credentials or upload financial dumps as GitHub Actions artifacts.

Suggested starting targets: at most 24 hours of lost writes (RPO), recovery within 4 hours (RTO), 7 daily and 4 weekly copies, monthly restore drills and a backup before each migration. These are proposed operational targets, **not guarantees achieved by this repository**. Choose tighter targets when usage warrants them. A manual pre-migration dump alone does not satisfy daily automated backup coverage.

PostgreSQL references: [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html).
