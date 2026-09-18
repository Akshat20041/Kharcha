import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const directory = "apps/api/prisma/migrations/";
export function checkMigrations(base, cwd = process.cwd()) {
  if (!base || !/^[a-zA-Z0-9_./^~-]+$/.test(base) || base.startsWith("-")) throw new Error("A valid comparison commit is required");
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const revision = git("rev-parse", "--verify", `${base}^{commit}`);
  const files = git("ls-tree", "-r", "--name-only", revision, "--", directory).split("\n").filter(Boolean);
  for (const file of files) {
    const before = git("rev-parse", `${revision}:${file}`);
    let after;
    try { after = git("rev-parse", `HEAD:${file}`); } catch { throw new Error(`Migration history was removed: ${file}`); }
    if (before !== after) throw new Error(`Migration history was changed: ${file}. Add a new migration instead.`);
  }
  const added = git("diff", "--name-only", "--diff-filter=A", revision, "HEAD", "--", directory).split("\n").filter((file) => file.endsWith("/migration.sql"));
  const latest = files.filter((file) => file.endsWith("/migration.sql")).sort().at(-1);
  for (const file of added) {
    if (!/^\d{14}_[a-zA-Z0-9_-]+\/migration\.sql$/.test(file.slice(directory.length)) || (latest && file <= latest)) {
      throw new Error(`New migration must sort after existing history and use a timestamp: ${file}`);
    }
  }
  const schemaChanged = git("diff", "--name-only", revision, "HEAD", "--", "apps/api/prisma/schema.prisma");
  if (schemaChanged && !added.length) throw new Error("Schema changed without a new migration; document comment-only changes in a separate reviewed migration if necessary.");
  return added;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const added = checkMigrations(process.env.MIGRATION_BASE || process.argv[2] || "HEAD^");
    console.log(`Migration history preserved; ${added.length} new migration(s).`);
    if (added.length) console.log("Review every new SQL file and follow Docs/STAGE_6.md before merging. This check does not prove SQL is safe.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
