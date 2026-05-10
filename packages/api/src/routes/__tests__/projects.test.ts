import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../index.js';
import { TEST_JWT_SECRET, testAuthHeader } from '../../test-utils/auth.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

let originalSecret: string | undefined;

beforeAll(() => {
  originalSecret = process.env.SUPABASE_JWT_SECRET;
  process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
});

afterAll(() => {
  if (originalSecret !== undefined) {
    process.env.SUPABASE_JWT_SECRET = originalSecret;
  } else {
    delete process.env.SUPABASE_JWT_SECRET;
  }
});

describe('Projects routes', () => {
  const app = createApp();

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------
  describe('auth enforcement', () => {
    it('GET /api/v1/projects requires auth', async () => {
      const res = await app.request('/api/v1/projects');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/projects requires auth', async () => {
      const res = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/projects/:id requires auth', async () => {
      const res = await app.request(`/api/v1/projects/${UUID}`);
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/projects/:id requires auth', async () => {
      const res = await app.request(`/api/v1/projects/${UUID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/projects/:id requires auth', async () => {
      const res = await app.request(`/api/v1/projects/${UUID}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/projects/:id/members requires auth', async () => {
      const res = await app.request(`/api/v1/projects/${UUID}/members`);
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/projects/:id/members requires auth', async () => {
      const res = await app.request(`/api/v1/projects/${UUID}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: UUID, role: 'editor' }),
      });
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/projects/:id/members/:userId requires auth', async () => {
      const res = await app.request(
        `/api/v1/projects/${UUID}/members/${UUID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'viewer' }),
        },
      );
      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/projects/:id/members/:userId requires auth', async () => {
      const res = await app.request(
        `/api/v1/projects/${UUID}/members/${UUID}`,
        { method: 'DELETE' },
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    it('POST /api/v1/projects rejects empty name', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/projects rejects name too long', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(201) }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/projects rejects missing body', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/projects', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/projects/:id rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/projects/not-a-uuid', {
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/projects/:id rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/projects/not-a-uuid', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Valid' }),
      });
      expect(res.status).toBe(400);
    });

    it('DELETE /api/v1/projects/:id rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/projects/not-a-uuid', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/projects/:id/members rejects invalid role', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}/members`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: UUID, role: 'superadmin' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/projects/:id/members rejects invalid userId', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}/members`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'not-a-uuid', role: 'editor' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/projects/:id/members rejects missing role', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}/members`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: UUID }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/projects/:id/members/:userId rejects invalid role', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${UUID}/members/${UUID}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'superadmin' }),
        },
      );
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/projects accepts valid status filter', async () => {
      const headers = await testAuthHeader();
      // This will fail at DB level (no DATABASE_URL), but should not be 422
      const res = await app.request(
        '/api/v1/projects?status=active',
        { headers },
      );
      // Should be 500 (no DB) rather than 422 (validation error)
      expect(res.status).not.toBe(422);
    });

    it('GET /api/v1/projects rejects invalid status filter', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        '/api/v1/projects?status=invalid_status',
        { headers },
      );
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/projects/:id rejects invalid status', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid_status' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Happy-path integration tests (deferred until DB infra is available)
  // -------------------------------------------------------------------------
  describe.todo('integration: listProjects');
  describe.todo('integration: createProject');
  describe.todo('integration: getProject');
  describe.todo('integration: updateProject');
  describe.todo('integration: deleteProject');
  describe.todo('integration: listMembers');
  describe.todo('integration: addMember');
  describe.todo('integration: updateMemberRole');
  describe.todo('integration: removeMember');
});
