import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

/** Symmetric secret used exclusively in tests. Never use in production. */
export const TEST_JWT_SECRET = 'test-jwt-secret-for-vitest-only';

const secret = new TextEncoder().encode(TEST_JWT_SECRET);

interface TestJwtClaims {
  sub: string;
  email: string;
  phone: string;
  role: string;
  exp: number;
}

/**
 * Create a signed JWT for testing.
 *
 * Set `process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET` in your
 * `beforeAll` / `afterAll` to make the auth middleware accept these tokens.
 */
export async function createTestJwt(
  overrides?: Partial<TestJwtClaims>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: overrides?.sub ?? randomUUID(),
    role: overrides?.role ?? 'authenticated',
    ...(overrides?.email !== undefined && { email: overrides.email }),
    ...(overrides?.phone !== undefined && { phone: overrides.phone }),
  };

  const exp = overrides?.exp ?? now + 3600;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret);
}

/** Convenience: returns a headers object with a valid Bearer token. */
export async function testAuthHeader(
  overrides?: Partial<TestJwtClaims>,
): Promise<{ Authorization: string }> {
  const jwt = await createTestJwt(overrides);
  return { Authorization: `Bearer ${jwt}` };
}
