import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";

export function registerCategories(app: FastifyInstance, db: PrismaClient) {
  app.get("/categories", async () => ({
    data: await db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  }));
}
