/**
 * Auth middleware.
 *
 * - Production / staging: verify Supabase JWTs (RS256 or ES256) against
 *   the JWKS endpoint. The `sub` claim becomes `userId` on the request
 *   context. Supabase rotated to ES256 in 2026; both are accepted.
 * - Test: accept HS256 JWTs signed with `TEST_JWT_SECRET`. This branch
 *   only fires when `NODE_ENV === 'test'`; production rejects HS256.
 *
 * Failure modes (all return 401 with structured bodies):
 *   - Missing Authorization header → `unauthenticated`
 *   - Malformed Bearer scheme       → `unauthenticated`
 *   - Verification failure          → `invalid_token`
 *   - Expired token                 → `token_expired`
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import {
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { getEnv } from "../env.js";
import { getJwks } from "../lib/jwks.js";

export type AuthVariables = {
  userId: string;
  jwtPayload: JWTPayload;
};

export type AuthMiddlewareOptions = {
  /** Override the JWKS resolver in tests. */
  jwksResolver?: typeof getJwks;
};

const BEARER_PREFIX = /^Bearer\s+(.+)$/i;

export const authMiddleware = (options: AuthMiddlewareOptions = {}) =>
  createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const header = c.req.header("authorization");
    if (!header) {
      throw new HTTPException(401, { message: "Authorization header missing" });
    }
    const match = BEARER_PREFIX.exec(header);
    if (!match || !match[1]) {
      throw new HTTPException(401, {
        message: "Authorization header must be 'Bearer <token>'",
      });
    }
    const token = match[1].trim();

    let payload: JWTPayload;
    try {
      payload = await verifyToken(token, options.jwksResolver ?? getJwks);
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        throw new HTTPException(401, { message: "Token expired" });
      }
      if (
        err instanceof joseErrors.JWTInvalid ||
        err instanceof joseErrors.JWSSignatureVerificationFailed ||
        err instanceof joseErrors.JWTClaimValidationFailed
      ) {
        throw new HTTPException(401, { message: "Invalid token" });
      }
      throw new HTTPException(401, { message: "Invalid token" });
    }

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new HTTPException(401, { message: "Token missing sub claim" });
    }

    c.set("userId", payload.sub);
    c.set("jwtPayload", payload);
    await next();
  });

async function verifyToken(
  token: string,
  jwksResolver: () => ReturnType<typeof getJwks>,
): Promise<JWTPayload> {
  const env = getEnv();

  // Test bypass: HS256 with the shared test secret. The verify call
  // enforces the algorithm so a real RS256 token is also rejected
  // here — production code must use the JWKS path.
  if (env.NODE_ENV === "test" && env.TEST_JWT_SECRET) {
    const secret = new TextEncoder().encode(env.TEST_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    return payload;
  }

  const { payload } = await jwtVerify(token, jwksResolver(), {
    algorithms: ["RS256", "ES256"],
  });
  return payload;
}
