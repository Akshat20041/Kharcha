import "dotenv/config";
import { createDatabase } from "../src/database.js";
import { readConfig } from "../src/config.js";
import { transferLocalData } from "../src/transfer-local-data.js";

const [target, confirmation, ...extra] = process.argv.slice(2);
if (!target || extra.length || confirmation && confirmation !== "--confirm") {
  console.error("Usage: npm run data:transfer -- <account-uuid> [--confirm]. Without --confirm, only counts are shown.");
  process.exitCode = 1;
} else {
  const db = createDatabase(readConfig().DATABASE_URL);
  try { console.log(await transferLocalData(db, target, confirmation === "--confirm")); }
  catch { console.error("Transfer failed. Check the account ID, migrations and database connection. No partial transfer is committed."); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
