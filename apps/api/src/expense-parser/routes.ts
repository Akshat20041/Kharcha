import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ExpenseProvider } from "./provider.js";
import { parseRequest } from "./schema.js";
import { parseExpense } from "./service.js";

export function registerParser(app: FastifyInstance, db: PrismaClient, providerForUser: (userId: string) => ExpenseProvider, zone: string, clock: () => Date) {
  app.post("/expense-parser/parse", { bodyLimit: 8192 }, async (request, reply) => {
    const input = parseRequest.parse(request.body);
    const categories = await db.category.findMany({ select: { id: true, name: true } });
    reply.header("Cache-Control", "no-store");
    // Never persists an expense; the provider separately records usage metadata.
    return parseExpense(providerForUser(request.userId), input.text, categories, input.time_zone ?? request.userTimeZone ?? zone, clock());
  });
}
