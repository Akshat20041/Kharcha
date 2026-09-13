import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "./transactions/domain.js";

// Matches the explicit legacy-data backfill. Never selected by browser input.
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
export type IdentityResolver = (request: FastifyRequest) => Promise<string | null>;

declare module "fastify" {
  interface FastifyRequest { userId: string; userTimeZone: string }
}

export function requireUserId(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(401, "User identity required");
  return parsed.data;
}
