import { buildApp } from "../../api/src/app.js";
import { readConfig } from "../../api/src/config.js";
import { createDatabase } from "../../api/src/database.js";
import { seedCategories } from "../../api/prisma/categories.js";
import { startTestDatabase } from "../../api/test/integration/database.js";

export default async function setup() {
  const cluster = await startTestDatabase();
  const db = createDatabase(cluster.url);
  const app = buildApp(readConfig({ NODE_ENV: "test", DATABASE_URL: cluster.url, LOG_LEVEL: "silent", APP_TIMEZONE: "Asia/Kolkata", WEB_ORIGIN: "http://localhost:3310" }), { db,
    // Test-only dependency injection: browser tests never call a live AI provider.
    expenseProvider: { extract: async (text) => {
      if (text === "provider unavailable") throw new Error("test provider offline");
      const missing = text === "coffee at Starbucks";
      const split = text.includes("split 4");
      return { amount: missing ? null : split ? "1200" : "450", amount_source: missing ? null : split ? "1200" : "450",
        description: missing ? "coffee" : "dinner", merchant: missing ? "Starbucks" : text.includes("Meghana") ? "Meghana" : null,
        category: "Food & Dining", category_confidence: 0.95, date_expression: text.includes("yesterday") ? "yesterday" : null,
        time_expression: null, is_split: split, participant_count: split ? 4 : null, notes: null };
    } },
  });
  try {
    await seedCategories(db);
    // Test fixture only: the last browser test stops the real API to check failure states.
    app.post("/__test/stop", async () => { setTimeout(() => void app.close(), 10); return { stopping: true }; });
    await app.listen({ host: "127.0.0.1", port: 3311 });
  } catch (error) {
    await app.close(); await db.$disconnect(); await cluster.stop(); throw error;
  }
  return async () => { await app.close(); await db.$disconnect(); await cluster.stop(); };
}
