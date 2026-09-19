import type { FastifyInstance } from "fastify";

// Route templates, not raw URLs: IDs, query strings, tokens and payloads must
// never become error-tracking or slow-request dimensions.
export function registerRequestLogging(app: FastifyInstance, slowRequestMs: number) {
  app.addHook("onResponse", async (request, reply) => {
    const slow = reply.elapsedTime >= slowRequestMs;
    const fields = {
      event: reply.statusCode >= 500 ? "request_error" : slow ? "slow_request" : "request_completed",
      method: request.method, route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode, latencyMs: reply.elapsedTime, slow,
      ...(request.userId ? { userId: request.userId } : {}),
    };
    if (reply.statusCode >= 500) request.log.error(fields, "Request completed");
    else if (slow) request.log.warn(fields, "Request completed");
    else request.log.info(fields, "Request completed");
  });
}
