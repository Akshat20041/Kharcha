import { buildApp } from "../../api/src/app.js";
import { readConfig } from "../../api/src/config.js";
import { createDatabase } from "../../api/src/database.js";
import { seedCategories } from "../../api/prisma/categories.js";
import { startTestDatabase } from "../../api/test/integration/database.js";
import { startAuthFixture } from "../../api/test/fixtures/supabase.js";

export default async function setup() {
  const cluster = await startTestDatabase(); const db = createDatabase(cluster.url);
  const auth = await startAuthFixture(3312);
  const app = buildApp(readConfig({ NODE_ENV: "test", DATABASE_URL: cluster.url, LOG_LEVEL: "silent", APP_TIMEZONE: "Asia/Kolkata", WEB_ORIGIN: "http://localhost:3310",
    AUTH_MODE: "supabase", SUPABASE_URL: auth.url, SUPABASE_PUBLISHABLE_KEY: "test-public-key" }), { db });
  try { await seedCategories(db); await app.listen({ host: "127.0.0.1", port: 3311 }); }
  catch (error) { await app.close(); await auth.app.close(); await db.$disconnect(); await cluster.stop(); throw error; }
  return async () => { await app.close(); await auth.app.close(); await db.$disconnect(); await cluster.stop(); };
}
