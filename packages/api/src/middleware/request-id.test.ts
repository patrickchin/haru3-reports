import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requestId, type RequestIdVariables } from "./request-id.js";

function buildApp() {
  const app = new Hono<{ Variables: RequestIdVariables }>();
  app.use("*", requestId());
  app.get("/", (c) => c.json({ id: c.get("requestId") }));
  return app;
}

describe("requestId middleware", () => {
  it("propagates an inbound x-request-id header", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      headers: { "x-request-id": "abc123" },
    });
    expect(res.headers.get("x-request-id")).toBe("abc123");
    expect((await res.json()) as { id: string }).toEqual({ id: "abc123" });
  });

  it("ignores excessively long inbound ids and mints a UUID", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      headers: { "x-request-id": "x".repeat(500) },
    });
    expect(res.headers.get("x-request-id")).not.toContain("x".repeat(50));
  });

  it("mints a UUID when no header is present", async () => {
    const app = buildApp();
    const res = await app.request("/");
    expect(res.headers.get("x-request-id")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });
});
