import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';

export interface AuthUser {
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

// Lazily initialised JWKS fetcher (cached across requests).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(supabaseUrl: string) {
  if (!jwks) {
    const issuer = supabaseUrl.replace(/\/+$/, '');
    jwks = createRemoteJWKSet(
      new URL(`${issuer}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

/**
 * Verify a Supabase JWT.
 *
 * 1. If SUPABASE_URL is set, verify via the JWKS endpoint (supports ES256 /
 *    RS256 keys that newer Supabase versions emit).
 * 2. Fall back to the symmetric SUPABASE_JWT_SECRET for older setups or
 *    environments where JWKS is unavailable.
 */
async function verifyToken(token: string): Promise<JWTPayload> {
  const supabaseUrl = process.env.SUPABASE_URL;

  // Primary: JWKS-based verification (works with ES256 + HS256).
  if (supabaseUrl) {
    try {
      const { payload } = await jwtVerify(token, getJwks(supabaseUrl));
      return payload;
    } catch {
      // Reset cached JWKS in case keys rotated, then fall through.
      jwks = null;
    }
  }

  // Fallback: symmetric secret (HS256).
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new HTTPException(500, { message: 'JWT secret not configured' });
  }

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(secret),
  );
  return payload;
}

export const auth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization');

  if (!header?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing authorization token' });
  }

  const token = header.slice(7);

  try {
    const payload = await verifyToken(token);

    c.set('user', {
      sub: payload.sub as string,
      email: payload.email as string | undefined,
      phone: payload.phone as string | undefined,
      role: payload.role as string | undefined,
    });

    await next();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }
};
