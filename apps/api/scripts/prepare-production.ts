import { config as dotenv } from "dotenv";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readConfig } from "../src/config.js";
import { createDatabase } from "../src/database.js";
import { seedCategories } from "../prisma/categories.js";

// Deliberately separate from .env, build and startup. Run from the API workspace.
dotenv({ path: ".env.production", quiet: true });
const require = createRequire(import.meta.url);
async function prepare() {
  const config = readConfig();
  if (config.NODE_ENV !== "production") throw new Error("Production configuration required");
  const project = new URL(config.SUPABASE_URL!).hostname.split(".")[0];
  const connection = new URL(config.DATABASE_URL);
  const direct = connection.hostname === `db.${project}.supabase.co`;
  const sessionPool = connection.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(connection.username).endsWith(`.${project}`);
  if (!(direct || sessionPool) || connection.port && connection.port !== "5432") throw new Error("Use this project's direct or session-pooler connection on port 5432");
  if (!["require", "verify-ca", "verify-full"].includes(connection.searchParams.get("sslmode") ?? "")) throw new Error("Production database TLS required");
  if (process.argv[2] !== `--confirm-project=${project}`) throw new Error("Explicit --confirm-project=<Supabase project reference> required");
  if (process.env.SUPABASE_DATA_API_DISABLED !== "true") throw new Error("Disable Supabase Data API, then set SUPABASE_DATA_API_DISABLED=true for this command");
  console.log("Applying reviewed Prisma migrations to the confirmed Supabase project.");
  const migrated = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], { stdio: "inherit", env: process.env });
  if (migrated.status !== 0) throw new Error("Migration failed; seed was not run");
  const db = createDatabase(config.DATABASE_URL);
  try { await seedCategories(db); console.log("Production reference categories ready. No personal transactions seeded."); }
  finally { await db.$disconnect(); }
}
prepare().catch(() => {
  console.error("Production preparation failed. Check the explicit project confirmation, TLS session/direct connection, Data API acknowledgement and migration status. Credentials are not logged.");
  process.exitCode = 1;
});
