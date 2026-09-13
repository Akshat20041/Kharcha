import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createSchema, deleteSchema, idSchema, listSchema, updateSchema } from "./domain.js";
import { transactionService } from "./service.js";

export function registerTransactionRoutes(app: FastifyInstance, db: PrismaClient, timeZone: string, clock: () => Date) {
  const service = (request: FastifyRequest) => transactionService(db, request.userTimeZone || timeZone, clock, request.userId);

  app.get("/categories", async () => ({
    data: await db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  }));

  app.post("/transactions", async (request, reply) => {
    const row = await service(request).create(createSchema.parse(request.body));
    return reply.code(201).header("Location", `/transactions/${row.id}`).send(row);
  });

  app.get("/transactions", async (request) => {
    const { limit, offset } = listSchema.parse(request.query);
    return service(request).list(limit, offset);
  });

  app.get("/transactions/:id", async (request) => {
    return service(request).get(idSchema.parse(request.params).id);
  });

  app.patch("/transactions/:id", async (request) => {
    return service(request).update(idSchema.parse(request.params).id, updateSchema.parse(request.body));
  });

  app.delete("/transactions/:id", async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    deleteSchema.parse(request.query);
    await service(request).delete(id);
    return reply.code(204).send();
  });
}
