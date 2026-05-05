/**
 * Test-only helpers for minting JWTs that the auth middleware accepts.
 *
 * Uses HS256 with `TEST_JWT_SECRET`. Only active when `NODE_ENV=test`.
 */
import { SignJWT } from "jose";

export type TestJwtClaims = {
  sub: string;
  exp?: number | string;
  /** Extra claims merged onto the payload. */
  extra?: Record<string, unknown>;
};

export async function mintTestJwt(claims: TestJwtClaims): Promise<string> {
  const secret = process.env.TEST_JWT_SECRET;
  if (!secret) {
    throw new Error("TEST_JWT_SECRET is not set; cannot mint test JWT");
  }
  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000);
  const exp =
    typeof claims.exp === "number"
      ? claims.exp
      : typeof claims.exp === "string"
        ? parseRelative(claims.exp, now)
        : now + 60 * 60;

  return new SignJWT({ ...claims.extra, sub: claims.sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
}

function parseRelative(spec: string, now: number): number {
  const match = /^(-?\d+)([smhd])$/.exec(spec.trim());
  if (!match) throw new Error(`Invalid duration: ${spec}`);
  const [, n, unit] = match;
  const value = Number(n);
  const seconds =
    unit === "s"
      ? value
      : unit === "m"
        ? value * 60
        : unit === "h"
          ? value * 60 * 60
          : value * 60 * 60 * 24;
  return now + seconds;
}

/** Convenience: returns `{ Authorization: 'Bearer <jwt>' }` */
export async function authHeaders(
  userId: string,
  opts: Omit<TestJwtClaims, "sub"> = {},
): Promise<Record<string, string>> {
  const token = await mintTestJwt({ sub: userId, ...opts });
  return { Authorization: `Bearer ${token}` };
}
