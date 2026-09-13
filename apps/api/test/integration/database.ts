import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const exec = promisify(execFile);
const require = createRequire(import.meta.url);

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port available");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

export async function startTestDatabase() {
  // Always create a new isolated cluster. Never read DATABASE_URL or reset a user database.
  const root = resolve(apiRoot, "../../.test-postgres");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, "run-"));
  const childPath = relative(root, directory);
  if (childPath.startsWith("..") || !childPath.startsWith("run-")) throw new Error("Unsafe test database path");
  const port = await availablePort();
  const password = randomBytes(20).toString("hex");
  const database = new EmbeddedPostgres({
    databaseDir: directory, port, user: "postgres", password,
    persistent: false, createPostgresUser: false, authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {}, onError: () => {},
  });
  await database.initialise();
  await database.start();
  const stop = async () => {
    const stopping = database.stop();
    if (process.platform === "win32") {
      // The library uses taskkill on Windows, which can be restricted. pg_ctl
      // signals only this test cluster and also works without taskkill access.
      const binaryPackage = "@embedded-postgres/windows-x64";
      const binaries = await import(binaryPackage) as { pg_ctl: string };
      await exec(binaries.pg_ctl, ["-D", directory, "-m", "fast", "-W", "stop"], {
        windowsHide: true, timeout: 10000,
      }).catch(() => { /* The library may already have stopped and removed the cluster. */ });
    }
    await stopping;
  };
  try {
    await database.createDatabase("kharcha_test");
    const url = `postgresql://postgres:${password}@127.0.0.1:${port}/kharcha_test`;
    const migrate = () => exec(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
      cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, windowsHide: true, timeout: 30000,
    });
    await migrate();
    await migrate();
    return { url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
