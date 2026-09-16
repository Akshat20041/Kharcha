import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import test from "node:test";
import { databaseConnectionString } from "../src/database.js";

test("hosted Supabase connections verify certificates and hostnames using the bundled public CA", () => {
  const url = new URL(databaseConnectionString("postgresql://postgres.project:test@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require"));
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  const cert = new X509Certificate(readFileSync(url.searchParams.get("sslrootcert")!));
  assert.equal(cert.ca, true);
  assert.ok(Date.parse(cert.validTo) > Date.now());
  const custom = new URL(databaseConnectionString("postgresql://postgres:test@db.project.supabase.co:5432/postgres?sslrootcert=custom.crt"));
  assert.equal(custom.searchParams.get("sslrootcert"), "custom.crt");
  for (const host of ["localhost", "127.0.0.1", "pooler.supabase.com.attacker.test"]) {
    const original = `postgresql://test:test@${host}:5432/local`;
    assert.equal(databaseConnectionString(original), original);
  }
});
