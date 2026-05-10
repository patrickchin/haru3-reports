import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../index.js';
import { TEST_JWT_SECRET, testAuthHeader } from '../../test-utils/auth.js';

const originalSecret = process.env.SUPABASE_JWT_SECRET;
beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
});
afterAll(() => {
  if (originalSecret) process.env.SUPABASE_JWT_SECRET = originalSecret;
  else delete process.env.SUPABASE_JWT_SECRET;
});

describe('Profile routes', () => {
  const app = createApp();

  describe('auth enforcement', () => {
    it('GET /api/v1/profile requires auth', async () => {
      const res = await app.request('/api/v1/profile');
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/profile requires auth', async () => {
      const res = await app.request('/api/v1/profile', { method: 'PATCH' });
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/profile/usage requires auth', async () => {
      const res = await app.request('/api/v1/profile/usage');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/profile/usage/history requires auth', async () => {
      const res = await app.request('/api/v1/profile/usage/history');
      expect(res.status).toBe(401);
    });

    it('rejects expired JWT token', async () => {
      const headers = await testAuthHeader({ exp: Math.floor(Date.now() / 1000) - 60 });
      const res = await app.request('/api/v1/profile', { headers });
      expect(res.status).toBe(401);
    });

    it('rejects malformed Bearer token', async () => {
      const res = await app.request('/api/v1/profile', {
        headers: { Authorization: 'Bearer garbage.token.here' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('input validation', () => {
    it('PATCH /api/v1/profile rejects invalid avatarUrl', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: 'not-a-url' }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/profile rejects fullName exceeding max length', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'a'.repeat(201) }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/profile rejects empty fullName', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/profile rejects companyName exceeding max length', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: 'c'.repeat(201) }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/profile with empty body is valid (all optional)', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Should pass validation — will fail at DB level, not 400
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(422);
    });

    it('GET /api/v1/profile/usage/history rejects limit=0', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile/usage/history?limit=0', { headers });
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/profile/usage/history rejects limit > 100', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile/usage/history?limit=101', { headers });
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/profile/usage/history rejects non-numeric limit', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/profile/usage/history?limit=abc', { headers });
      expect(res.status).toBe(400);
    });
  });

  // Happy paths deferred until integration testing
  describe.todo('integration: get profile');
  describe.todo('integration: update profile');
  describe.todo('integration: usage summary');
  describe.todo('integration: usage history');
});
