import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../index.js';
import { TEST_JWT_SECRET, testAuthHeader } from '../../test-utils/auth.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_UUID = '660e8400-e29b-41d4-a716-446655440000';

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

describe('Reports routes', () => {
  const app = createApp();

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------
  describe('auth enforcement', () => {
    it('GET /api/v1/projects/:projectId/reports requires auth', async () => {
      const res = await app.request(`/api/v1/projects/${PROJECT_UUID}/reports`);
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/projects/:projectId/reports requires auth', async () => {
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportType: 'daily' }),
        },
      );
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/reports/:id requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}`);
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/reports/:id requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/reports/:id requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/reports/:id/generate requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/reports/:id/finalize requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}/finalize`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/reports/:id/pdf requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}/pdf`);
      expect(res.status).toBe(401);
    });

    it('rejects expired JWT token', async () => {
      const headers = await testAuthHeader({ exp: Math.floor(Date.now() / 1000) - 60 });
      const res = await app.request(`/api/v1/reports/${UUID}`, { headers });
      expect(res.status).toBe(401);
    });

    it('rejects malformed Bearer token', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}`, {
        headers: { Authorization: 'Bearer not.valid.jwt' },
      });
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    // -- list reports --
    it('GET list reports rejects invalid projectId', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        '/api/v1/projects/not-a-uuid/reports',
        { headers },
      );
      expect(res.status).toBe(400);
    });

    it('GET list reports rejects invalid status filter', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports?status=invalid_status`,
        { headers },
      );
      expect(res.status).toBe(400);
    });

    it('GET list reports rejects limit=0', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports?limit=0`,
        { headers },
      );
      expect(res.status).toBe(400);
    });

    it('GET list reports rejects limit > 100', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports?limit=101`,
        { headers },
      );
      expect(res.status).toBe(400);
    });

    it('GET list reports rejects non-numeric limit', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports?limit=abc`,
        { headers },
      );
      expect(res.status).toBe(400);
    });

    // -- create report --
    it('POST create report rejects invalid projectId param', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        '/api/v1/projects/not-a-uuid/reports',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportType: 'daily' }),
        },
      );
      expect(res.status).toBe(400);
    });

    it('POST create report rejects invalid reportType', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportType: 'invalid_type' }),
        },
      );
      expect(res.status).toBe(400);
    });

    it('POST create report rejects title exceeding max length', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'a'.repeat(501) }),
        },
      );
      expect(res.status).toBe(400);
    });

    it('POST create report rejects empty title string', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/projects/${PROJECT_UUID}/reports`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '' }),
        },
      );
      expect(res.status).toBe(400);
    });

    // -- get/update/delete UUID param --
    it('GET report rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/reports/not-a-uuid', {
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('PATCH report rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/reports/not-a-uuid', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });
      expect(res.status).toBe(400);
    });

    it('DELETE report rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/reports/not-a-uuid', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(400);
    });

    // -- update report body validation --
    it('PATCH report with empty body is valid (all fields optional)', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/reports/${UUID}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Should not be a validation error — will fail at DB level (500) or succeed
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(422);
    });

    it('PATCH report rejects invalid status value', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/reports/${UUID}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'bogus_status' }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH report rejects title exceeding max length', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/reports/${UUID}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(501) }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH report rejects empty title string', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/reports/${UUID}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });
      expect(res.status).toBe(400);
    });

    // -- generate report --
    it('POST generate rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/reports/not-a-uuid/generate', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('POST generate rejects invalid provider', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/reports/${UUID}/generate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'invalid_provider' }),
      });
      expect(res.status).toBe(400);
    });

    // -- finalize --
    it('POST finalize rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/reports/not-a-uuid/finalize', {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(400);
    });

    // -- pdf --
    it('GET pdf rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/reports/not-a-uuid/pdf', {
        headers,
      });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Happy-path integration tests (deferred until DB infra is available)
  // -------------------------------------------------------------------------
  describe.todo('integration: listReports');
  describe.todo('integration: createReport');
  describe.todo('integration: getReport');
  describe.todo('integration: updateReport');
  describe.todo('integration: deleteReport');
  describe.todo('integration: generateReport');
  describe.todo('integration: finalizeReport');
  describe.todo('integration: getReportPdf');
});
