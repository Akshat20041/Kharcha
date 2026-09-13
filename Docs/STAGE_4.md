# Stage 4: Production configuration and security hardening

This stage prepares configuration and request safeguards. No deployment or Stage 5 work is included.

## Environments

Development: keep `apps/api/.env` and `apps/web/.env.local` private. Start with the corresponding `.env.example` files. Existing Supabase settings continue to work. `AUTH_MODE=local` is only for the private local ledger; both applications must use matching modes.

Tests: `npm run test:integration`, `test:e2e` and `test:e2e:auth` create isolated PostgreSQL databases. Auth tests use a local Supabase protocol fixture, never production accounts. Do not point tests at your personal database. `KHARCHA_E2E=1` is an internal test switch selecting `.next-e2e`; browser fixtures use ports 3310–3312.

Production: inject backend variables through the future host's secret settings. Set `NODE_ENV=production`, `AUTH_MODE=supabase`, an exact HTTPS `WEB_ORIGIN`, HTTPS `SUPABASE_URL`, public publishable/anon key, database connection and explicit timezone. API startup rejects local authentication, wildcard/insecure frontend origins, insecure auth URLs and privileged Supabase keys. Production frontend must use `NEXT_PUBLIC_AUTH_MODE=supabase` and HTTPS endpoints. Public frontend variables are embedded at build time: rebuild after changing them. Do not publish `.env` files.

| Backend variable | Purpose / default |
| --- | --- |
| `NODE_ENV` | `development` (default), `test`, or `production`; controls strict settings and limits |
| `HOST` | Bind address; default `127.0.0.1`; future container hosts typically need `0.0.0.0` |
| `PORT` | API port, default `3001` |
| `WEB_ORIGIN` | One exact allowed frontend origin, no trailing slash/path; local default `http://localhost:3000` |
| `LOG_LEVEL` | Pino level, default `info`; `silent` for tests |
| `APP_TIMEZONE` | IANA default for new accounts; host timezone if omitted; set explicitly in production |
| `DATABASE_URL` | Required PostgreSQL URL; backend only, use provider-required TLS in production |
| `AUTH_MODE` | `local` default; `supabase` required in production |
| `SUPABASE_URL` | Supabase project origin, required for Supabase mode |
| `SUPABASE_PUBLISHABLE_KEY` | Public publishable or legacy anon key; never service-role/secret key |
| `GROQ_API_KEY` | Optional backend-only credential; blank keeps manual expense entry available |
| `GROQ_MODEL` | Model identifier, default `qwen/qwen3.8-27b` |

| Frontend variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser-accessible REST API base URL; local `http://localhost:3001` |
| `NEXT_PUBLIC_AUTH_MODE` | Match backend `local` or `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase project as backend |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same public publishable/anon key; browser visible |

Root `.env` is only for optional Docker PostgreSQL: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`. The embedded development database uses the API's `DATABASE_URL` instead. `DIRECT_URL`, service-role keys and additional API URL aliases are not used. Node/Next manage frontend `NODE_ENV`; do not override it for `next dev`.

## Request safeguards

- Exact-origin CORS; unexpected Origin headers receive 403. REST clients without Origin still require authentication. CORS does not replace authentication.
- Helmet API headers; frontend frame blocking, MIME sniffing protection, no-referrer policy and disabled camera/microphone/geolocation. Frontend CSP restricts framing, objects and base URLs while preserving Next scripts. A nonce-based script CSP is not implemented.
- API HSTS is enabled in production and disabled locally. HTTPS termination and frontend HSTS belong to the future hosting setup.
- API JSON limit 32 KiB; parser route remains 8 KiB and text remains at most 1,500 characters. Prototype/constructor poisoning and malformed JSON are rejected. Request receive timeout is 30 seconds.
- Existing strict write schemas and ownership checks remain in force. Central errors return no stack traces or raw database/provider messages.
- `/health` remains public and does not require a database connection. It indicates process health, not database readiness.

## Rate limits

Fixed 60-second windows, per API process:

| Scope | Production requests/minute |
| --- | ---: |
| IP, before contacting Supabase | 300 |
| Per-user AI parsing | 10 |
| Per-user Excel exports | 5 |
| Per-user analytics + dashboard combined | 60 |
| Per-user profile (`/me`, read + write) | 30 |
| Per-user recurring generation | 20 |
| Per-user remaining routes combined | 240 |

Development and test limits are ten times higher. Failed attempts consume budget too. Responses use 429 and `Retry-After` seconds. Users have separate counters; different URLs within a group share its budget. Authenticated requests also consume their IP budget. Health and CORS preflight are exempt. The bounded 10,000-entry store rejects new keys when full rather than discarding active counters.

These limits reset on restart and are not shared across replicas. `trustProxy=false` prevents forged forwarding headers bypassing the IP limit. Before deploying behind a proxy, configure only the actual trusted proxy addresses/hops; otherwise all users can share the proxy's IP budget. Shared rate storage is a future deployment/scaling decision. Sign-in/signup go directly to Supabase: its Auth rate limits and email settings must be configured in that project; this API cannot throttle those external requests.

## Logs and Groq

Each completion record has a generated request ID, method, route template, status, latency and verified user UUID where available. Client-supplied request IDs are ignored. Raw paths/query strings, headers, tokens, bodies, financial descriptions and raw exception stacks are excluded. `X-Request-Id` allows correlating a response with its server log.

Groq remains backend-only, behind the existing Supabase verification in account mode. Production cannot enable local mode. Bounded input, per-user request budgets, provider timeout and existing graceful failure handling apply. Stored Groq usage contains metadata/token counts, not raw prompts. No live paid Groq calls are needed for this stage's tests.

## Dependency audit

The audit reports five entries from two transitive advisories: `uuid <11.1.1` through ExcelJS (two moderate entries) and `deepmerge-ts <8` through Prisma CLI configuration (three high entries). ExcelJS uses UUID v4, while the reported buffer-bounds issue affects v3/v5/v6; the application does not import workbooks or accept UUID output buffers. Prisma CLI merges trusted local configuration, not HTTP input; the recursion issue is in development tooling. These are remaining dependency findings, not a clean audit. Do not run `npm audit fix --force`: it proposes incompatible Prisma/ExcelJS downgrades. Revisit patched upstream releases before public launch.

## Verification and release checklist

Verified locally on 2026-09-13: Prisma validation, both TypeScript checks, both ESLint checks and both production builds passed. All 86 tests passed across the API unit/security tests (27, including the final targeted security run), web unit tests (9), PostgreSQL integration tests (38), product browser scenarios (9) and authentication browser scenarios (3). Browser assertions also verify frontend security headers. Integration tests apply all five migrations to isolated databases and exercise Excel downloads, ownership and provider failures. `git diff --check` passed. Dependency audit is the documented exception above.

- Security regression tests cover strict production configuration, private-key rejection, IP throttling before authentication, separate user budgets, window expiry/capacity, safe JSON, oversized bodies, headers and sensitive-data exclusion from logs.
- Run `npm run db:validate`, `typecheck`, `lint`, `test`, `test:web`, `test:integration`, `build`, `test:e2e`, and `test:e2e:auth` from the root.
- Before a future public launch: resolve/review the dependency findings, supply production secrets/HTTPS origins, configure Supabase redirect allowlist and Auth limits, configure trusted proxy handling, and verify HTTPS/security headers on the actual hosts.
- No database schema changes, personal-data changes, deployment or later-stage work is part of Stage 4.
