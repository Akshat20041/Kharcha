import "dotenv/config";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";

async function start() {
  const config = readConfig();
  const app = buildApp(config);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      app.close().catch(() => {
        console.error("API shutdown failed");
        process.exitCode = 1;
      });
    });
  }

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch {
    console.error("API failed to listen; check HOST, PORT, and whether the port is in use");
    await app.close();
    process.exitCode = 1;
  }
}

start().catch((error: unknown) => {
  console.error(error instanceof Error && error.message.startsWith("Invalid environment configuration:") ? error.message : "API startup failed; check configuration and dependencies");
  process.exitCode = 1;
});
