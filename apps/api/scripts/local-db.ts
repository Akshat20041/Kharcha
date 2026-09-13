import "dotenv/config";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { createConnection } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readConfig } from "../src/config.js";

// Optional development database. Its data survives process restarts.
const url = new URL(readConfig().DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("dev:db requires a localhost DATABASE_URL.");
}
const port = Number(url.port || 5432);
const name = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error("Unsupported local database name.");
const inUse = await new Promise<boolean>((done) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.once("connect", () => { socket.destroy(); done(true); });
  socket.once("error", () => done(false));
});
if (inUse) {
  const existing = new pg.Client({
    connectionString: url.toString(), connectionTimeoutMillis: 5000, query_timeout: 5000,
  });
  let healthy = false;
  try {
    await existing.connect();
    await existing.query("SELECT 1");
    healthy = true;
  } catch {
    console.error(`Port ${port} is occupied, but the configured database is not reachable. Check DATABASE_URL and the service using this port.`);
  } finally { await existing.end().catch(() => {}); }
  if (healthy) console.log(`PostgreSQL is already running on port ${port} and the configured database is healthy. No second instance is needed. You can start the API and frontend.`);
  process.exit(healthy ? 0 : 1);
}
const directory = resolve("../../.local-postgres");
const database = new EmbeddedPostgres({
  databaseDir: directory, port, user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password), persistent: true,
  createPostgresUser: false, authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {}, onError: () => {},
});
const initialized = await access(resolve(directory, "PG_VERSION")).then(() => true, () => false);
if (!initialized) await database.initialise();
await database.start();
const client = database.getPgClient("postgres", "127.0.0.1");
try {
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
} finally { await client.end(); }
console.log(`Local PostgreSQL ready on 127.0.0.1:${port}. Data persists in .local-postgres. Keep this terminal open.`);
// embedded-postgres handles Ctrl+C and stops the server without deleting data.
setInterval(() => {}, 60000);
