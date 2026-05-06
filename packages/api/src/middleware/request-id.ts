/**
 * Generate or propagate a request id for log/trace correlation.
 *
 * Uses incoming `x-request-id` header when present (e.g. from Fly proxy);
 * otherwise mints a UUID v4. Always echoed back in the response.
 */
import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";

export type RequestIdVariables = {
  requestId: string;
};

export const requestId = () =>
  createMiddleware<{ Variables: RequestIdVariables }>(async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const id = incoming && incoming.length <= 200 ? incoming : randomUUID();
    c.set("requestId", id);
    c.header("x-request-id", id);
    await next();
  });
