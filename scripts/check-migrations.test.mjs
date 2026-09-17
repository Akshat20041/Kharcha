import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkMigrations } from "./check-migrations.mjs";

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "kharcha-migration-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const write = (path, content) => { const file = join(cwd, path); mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, content); };
  const commit = () => { git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "test"); };
  git("init");
  write("apps/api/prisma/migrations/20260101000000_initial/migration.sql", "SELECT 1;\n");
  write("apps/api/prisma/schema.prisma", "// baseline\n");
  commit();
  return { cwd, write, commit, base: git("rev-parse", "HEAD") };
}
test("normal code and append-only migrations pass", (t) => {
  const f = fixture(t); f.write("app.txt", "change"); f.commit();
  assert.deepEqual(checkMigrations(f.base, f.cwd), []);
  f.write("apps/api/prisma/migrations/20260102000000_new/migration.sql", "SELECT 2;\n"); f.commit();
  assert.equal(checkMigrations(f.base, f.cwd).length, 1);
});
test("editing or deleting committed history fails", (t) => {
  const f = fixture(t); const path = "apps/api/prisma/migrations/20260101000000_initial/migration.sql";
  f.write(path, "SELECT 2;\n"); f.commit();
  assert.throws(() => checkMigrations(f.base, f.cwd), /history was changed/);
  rmSync(join(f.cwd, path)); f.commit();
  assert.throws(() => checkMigrations(f.base, f.cwd), /history was removed/);
});
test("backdated migrations and unaccompanied schema changes fail", (t) => {
  const f = fixture(t);
  f.write("apps/api/prisma/schema.prisma", "// changed\n"); f.commit();
  assert.throws(() => checkMigrations(f.base, f.cwd), /without a new migration/);
  f.write("apps/api/prisma/migrations/20250101000000_old/migration.sql", "SELECT 2;\n"); f.commit();
  assert.throws(() => checkMigrations(f.base, f.cwd), /sort after/);
});
