# Supabase public database CA

`supabase-ca.crt` is the public CA downloaded from this project's Supabase Database Settings, verified against the hosted session-pooler connection on 2026-09-16. It contains no private key or database credentials. Expires 2031-04-26; replace from the authenticated Supabase dashboard when the provider rotates its CA.

The API uses this certificate with `sslmode=verify-full` for Supabase database hosts. Explicit `sslrootcert` paths take precedence. Other PostgreSQL connections are unchanged. Keep this directory beside `src` and `dist` when deploying.
