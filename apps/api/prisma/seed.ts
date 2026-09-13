import "dotenv/config";
import { readConfig } from "../src/config.js";
import { createDatabase } from "../src/database.js";
import { seedCategories } from "./categories.js";

const db = createDatabase(readConfig().DATABASE_URL);
try {
  await seedCategories(db);
  console.log("Default categories seeded");
} catch {
  console.error("Category seed failed; check the connection and apply migrations first");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
