import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "./generated/prisma/client.js";
import { z } from "zod";
import { timeZoneSchema } from "./time-zone.js";

const patch = z.strictObject({ display_name: z.string().trim().max(100), time_zone: timeZoneSchema, currency: z.literal("INR") });
export function registerProfile(app: FastifyInstance, db: PrismaClient) {
  app.get("/me", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return db.user.findUniqueOrThrow({ where: { id: request.userId }, select: { id: true, display_name: true, time_zone: true, currency: true } });
  });
  app.patch("/me", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return db.user.update({ where: { id: request.userId }, data: patch.parse(request.body), select: { id: true, display_name: true, time_zone: true, currency: true } });
  });
}
