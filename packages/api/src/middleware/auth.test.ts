import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvForTesting } from "../env.js";
import { errorHandler } from "./error-handler.js";
import { authMiddleware, type AuthVariables } from "./auth.js";
import { mintTestJwt } from "../../tests/helpers/auth.js";

const TEST_SECRET = "test-secret-for-unit-tests";
const USER_ID = "00000000-0000-0000-0000-000000000001";

function buildApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware());
  app.get("/protected", (c) =>
    c.json({ userId: c.get("userId"), exp: c.get("jwtPayload").exp }),
  );
  app.onError(errorHandler);
  return app;
}

beforeEach(() => {
  resetEnvForTesting();
  process.env.NODE_ENV = "test";
  process.env.TEST_JWT_SECRET = TEST_SECRET;
});

describe("authMiddleware (test mode)", () => {
  it("rejects requests with no Authorization header", async () => {
    const app = buildApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("unauthenticated");
    expect(body.message).toMatch(/missing/i);
  });

  it("rejects malformed Bearer schemes", async () => {
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Token abc.def.ghi" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/Bearer/);
  });

  it("rejects tokens signed with the wrong secret", async () => {
    process.env.TEST_JWT_SECRET = "different-secret";
    const token = await mintTestJwt({ sub: USER_ID });
    process.env.TEST_JWT_SECRET = TEST_SECRET; // verifier secret
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Invalid token");
  });

  it("rejects garbage tokens", async () => {
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer not.a.jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects expired tokens with token_expired-style message", async () => {
    const token = await mintTestJwt({ sub: USER_ID, exp: "-5s" });
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Token expired");
  });

  it("rejects tokens missing a sub claim", async () => {
    // Mint by hand to omit sub.
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ extra: "yes" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(TEST_SECRET));

    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/sub/);
  });

  it("attaches userId from sub on a valid token", async () => {
    const token = await mintTestJwt({ sub: USER_ID });
    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; exp: number };
    expect(body.userId).toBe(USER_ID);
    expect(typeof body.exp).toBe("number");
  });
});

describe("authMiddleware (production mode)", () => {
  beforeEach(() => {
    resetEnvForTesting();
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.DATABASE_URL = "postgres://u:p@h:5432/d";
    process.env.TEST_JWT_SECRET = TEST_SECRET; // must NOT be honoured
  });

  it("rejects HS256 tokens even when TEST_JWT_SECRET is set", async () => {
    process.env.NODE_ENV = "test"; // mint
    const token = await mintTestJwt({ sub: USER_ID });
    process.env.NODE_ENV = "production"; // verify

    const app = buildApp();
    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    // The JWKS fetch will fail because we don't hit the network in
    // unit tests; either way the request must NOT be authenticated.
    expect(res.status).toBe(401);
  });
});
