import "dotenv/config";
import pg from "pg";
import { readConfig } from "../src/config.js";

async function checkDatabase() {
  const config = readConfig();
  const client = new pg.Client({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("PostgreSQL connection OK");
  } finally {
    await client.end();
  }
}

checkDatabase().catch(() => {
  console.error("PostgreSQL connection failed. Check DATABASE_URL and that PostgreSQL is running.");
  process.exitCode = 1;
});
