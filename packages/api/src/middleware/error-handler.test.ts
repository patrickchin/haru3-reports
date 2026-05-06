import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "./error-handler.js";
import { requestId } from "./request-id.js";

function buildTestApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", requestId());
  app.get("/throw-zod", () => {
    z.object({ id: z.string().uuid() }).parse({ id: "not-a-uuid" });
    return new Response("unreachable");
  });
  app.get("/throw-http/:status", (c) => {
    const status = Number(c.req.param("status"));
    throw new HTTPException(status as 400, { message: "boom" });
  });
  app.get("/throw-unknown", () => {
    throw new Error("ignored — should be 500");
  });
  app.onError(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("maps ZodError to 422 with field-level details", async () => {
    const app = buildTestApp();
    const res = await app.request("/throw-zod");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: unknown; requestId: string };
    expect(body.error).toBe("validation_failed");
    expect(body.details).toEqual([
      expect.objectContaining({ path: "id", code: expect.any(String) }),
    ]);
    expect(body.requestId).toBeTruthy();
  });

  it("propagates HTTPException status and message", async () => {
    const app = buildTestApp();
    const res = await app.request("/throw-http/403");
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: "forbidden", message: "boom" });
  });

  it("masks unknown errors as 500 internal_error without leaking message", async () => {
    const app = buildTestApp();
    const res = await app.request("/throw-unknown");
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "internal_error",
      message: "An unexpected error occurred",
    });
    // The original error message must NOT be exposed.
    expect(JSON.stringify(body)).not.toContain("ignored");
  });
});
