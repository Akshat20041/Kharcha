import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { fileURLToPath } from "node:url";

export function databaseConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  if (url.hostname.endsWith(".pooler.supabase.com") || /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    // The downloaded public Supabase CA is shared with the deployed API.
    // This path works from both src/ (tsx) and dist/ (production Node).
    url.searchParams.set("sslmode", "verify-full");
    if (!url.searchParams.has("sslrootcert")) {
      url.searchParams.set("sslrootcert", fileURLToPath(new URL("../certs/supabase-ca.crt", import.meta.url)));
    }
    return url.toString();
  }
  return connectionString;
}

export function createDatabase(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseConnectionString(connectionString), connectionTimeoutMillis: 5000 }),
  });
}
