import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import { RateLimit, routeBudget } from "./rate-limit.js";
import Fastify, { LogController } from "fastify";
import type { Config } from "./config.js";
import { ZodError } from "zod";
import { createDatabase } from "./database.js";
import { Prisma, type PrismaClient } from "./generated/prisma/client.js";
import { ApiError } from "./transactions/domain.js";
import { registerTransactionRoutes } from "./transactions/routes.js";
import { registerRecurringRoutes } from "./recurring/routes.js";
import { registerDashboard } from "./dashboard.js";
import { registerParser } from "./expense-parser/routes.js";
import { registerAnalytics } from "./analytics.js";
import { registerExports } from "./exports/routes.js";
import { groqProvider, type ExpenseProvider } from "./expense-parser/provider.js";
import { LOCAL_USER_ID, requireUserId, type IdentityResolver } from "./identity.js";
import { supabaseIdentity } from "./auth.js";
import { registerProfile } from "./profile.js";

export function buildApp(config: Config, options: { db?: PrismaClient; clock?: () => Date; expenseProvider?: ExpenseProvider; resolveIdentity?: IdentityResolver; logStream?: { write(message: string): void } } = {}) {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, stream: options.logStream,
      serializers: { req: () => ({}), res: () => ({}), err: () => ({ type: "Error", message: "Request failed", stack: "" }) } },
    logController: new LogController({ disableRequestLogging: true }), requestIdHeader: false, genReqId: () => randomUUID(),
    trustProxy: false, bodyLimit: 32768, requestTimeout: 30000,
    onProtoPoisoning: "error", onConstructorPoisoning: "error",
  });
  const limits = new RateLimit();
  const multiplier = config.NODE_ENV === "production" ? 1 : 10;
  const db = options.db ?? createDatabase(config.DATABASE_URL);
  const providerFetch = fetch;
  const resolveIdentity = options.resolveIdentity ?? (config.AUTH_MODE === "supabase" ? supabaseIdentity(config, db) : undefined);
  if (!options.db) app.addHook("onClose", async () => db.$disconnect());

  app.register(helmet, { crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: config.NODE_ENV === "production" ? undefined : false,
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.NODE_ENV === "production" ? [] : null } },
    frameguard: { action: "deny" }, referrerPolicy: { policy: "no-referrer" } });
  app.register(cors, { origin: config.WEB_ORIGIN, methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"] });
  app.get("/health", async () => ({ status: "ok" }));
  app.decorateRequest("userId", "");
  app.decorateRequest("userTimeZone", config.APP_TIMEZONE);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
    if (request.headers.origin && request.headers.origin !== config.WEB_ORIGIN) throw new ApiError(403, "Origin not allowed");
    if (request.routeOptions.url === "/health" || request.method === "OPTIONS") return;
    const ipRetry = limits.take(`ip:${request.ip}`, 300 * multiplier);
    if (ipRetry) { reply.header("Retry-After", ipRetry); throw new ApiError(429, "Too many requests. Please try again shortly."); }
    // Local mode is development-only. Configured Supabase never falls back.
    request.userId = requireUserId(resolveIdentity
      ? await resolveIdentity(request)
      : config.NODE_ENV === "production" ? null : LOCAL_USER_ID);
    const [bucket, maximum] = routeBudget(request.routeOptions.url ?? "");
    const retry = limits.take(`user:${request.userId}:${bucket}`, maximum * multiplier);
    if (retry) { reply.header("Retry-After", retry); throw new ApiError(429, "Too many requests. Please try again shortly."); }
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({ method: request.method, route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode, latencyMs: reply.elapsedTime,
      ...(request.userId ? { userId: request.userId } : {}) }, "Request completed");
  });
  registerProfile(app, db);
  registerTransactionRoutes(app, db, config.APP_TIMEZONE, options.clock ?? (() => new Date()));
  registerRecurringRoutes(app, db, config.APP_TIMEZONE, options.clock ?? (() => new Date()));
  registerDashboard(app, db, config.APP_TIMEZONE, options.clock ?? (() => new Date()));
  registerParser(app, db, (userId) => options.expenseProvider ?? groqProvider(config, providerFetch, async (usage) => {
    try { await db.groqApiUsage.create({ data: { ...usage, user_id: userId } }); }
    catch { app.log.warn("Could not record Groq usage; check database availability and migrations."); }
  }), config.APP_TIMEZONE, options.clock ?? (() => new Date()));
  registerAnalytics(app, db, config.APP_TIMEZONE, options.clock ?? (() => new Date()));
  registerExports(app, db, options.clock ?? (() => new Date()));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Validation failed", issues: error.issues.map((issue) => ({
        field: issue.path.join("."), message: issue.message,
      })) });
    }
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return reply.code(404).send({ error: "Transaction not found" });
      if (error.code === "P2003") return reply.code(400).send({ error: "Invalid category_id" });
      if (error.code === "P2002") return reply.code(409).send({ error: "Record already exists" });
    }
    const statusCode = error instanceof Error && "statusCode" in error ? error.statusCode : undefined;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: "Invalid request" });
    }
    // Do not return or log raw database errors that can contain financial data.
    request.log.error({ code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "INTERNAL_ERROR" }, "Request failed");
    return reply.code(500).send({ error: "Internal server error" });
  });

  return app;
}
