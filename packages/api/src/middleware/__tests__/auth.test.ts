import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { auth } from '../auth.js';
import {
  TEST_JWT_SECRET,
  createTestJwt,
  testAuthHeader,
} from '../../test-utils/auth.js';

// ---------------------------------------------------------------------------
// Env setup — make the middleware accept test-signed JWTs
// ---------------------------------------------------------------------------
const originalSecret = process.env.SUPABASE_JWT_SECRET;
beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
});
afterAll(() => {
  if (originalSecret) process.env.SUPABASE_JWT_SECRET = originalSecret;
  else delete process.env.SUPABASE_JWT_SECRET;
});

// ---------------------------------------------------------------------------
// Tiny app that exposes the authenticated user for assertions
// ---------------------------------------------------------------------------
function buildApp() {
  const app = new Hono();
  app.use('/protected/*', auth);
  app.get('/protected/me', (c) => c.json(c.get('user')));
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('auth middleware', () => {
  const app = buildApp();

  it('rejects when Authorization header is missing', async () => {
    const res = await app.request('/protected/me');
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Missing authorization token');
  });

  it('rejects a malformed Authorization header (no Bearer prefix)', async () => {
    const res = await app.request('/protected/me', {
      headers: { Authorization: 'Token abc' },
    });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Missing authorization token');
  });

  it('rejects an invalid JWT', async () => {
    const res = await app.request('/protected/me', {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Invalid or expired token');
  });

  it('rejects an expired JWT', async () => {
    const expired = Math.floor(Date.now() / 1000) - 3600;
    const token = await createTestJwt({ exp: expired });
    const res = await app.request('/protected/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Invalid or expired token');
  });

  it('passes a valid JWT and populates the user context', async () => {
    const sub = 'user-123';
    const email = 'alice@example.com';
    const headers = await testAuthHeader({ sub, email });

    const res = await app.request('/protected/me', { headers });
    expect(res.status).toBe(200);

    const user = await res.json();
    expect(user.sub).toBe(sub);
    expect(user.email).toBe(email);
    expect(user.role).toBe('authenticated');
  });

  it('extracts the phone claim from a valid JWT', async () => {
    const phone = '+1234567890';
    const headers = await testAuthHeader({ phone });

    const res = await app.request('/protected/me', { headers });
    expect(res.status).toBe(200);

    const user = await res.json();
    expect(user.phone).toBe(phone);
  });

  it('returns 500 when SUPABASE_JWT_SECRET is not set', async () => {
    const saved = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;

    try {
      const headers = await testAuthHeader();
      const res = await app.request('/protected/me', { headers });
      expect(res.status).toBe(500);
      const body = await res.text();
      expect(body).toContain('JWT secret not configured');
    } finally {
      process.env.SUPABASE_JWT_SECRET = saved;
    }
  });
});
