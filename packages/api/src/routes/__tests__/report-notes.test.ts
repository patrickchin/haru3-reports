import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../index.js';
import { TEST_JWT_SECRET, testAuthHeader } from '../../test-utils/auth.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '660e8400-e29b-41d4-a716-446655440000';

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

describe('Report Notes routes', () => {
  const app = createApp();

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------
  describe('auth enforcement', () => {
    it('GET /api/v1/reports/:reportId/notes requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}/notes`);
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/reports/:reportId/notes requires auth', async () => {
      const res = await app.request(`/api/v1/reports/${UUID}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', body: 'hello' }),
      });
      expect(res.status).toBe(401);
    });

    it('PATCH /api/v1/reports/:reportId/notes/:id requires auth', async () => {
      const res = await app.request(
        `/api/v1/reports/${UUID}/notes/${UUID2}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: 'updated' }),
        },
      );
      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/reports/:reportId/notes/:id requires auth', async () => {
      const res = await app.request(
        `/api/v1/reports/${UUID}/notes/${UUID2}`,
        { method: 'DELETE' },
      );
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/reports/:reportId/notes/reorder requires auth', async () => {
      const res = await app.request(
        `/api/v1/reports/${UUID}/notes/reorder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteIds: [UUID] }),
        },
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    it('POST /api/v1/reports/:reportId/notes rejects invalid reportId', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/reports/not-a-uuid/notes', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', body: 'hello' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/reports/:reportId/notes rejects invalid kind', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/reports/${UUID}/notes`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'invalid_kind' }),
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /api/v1/reports/:reportId/notes/:id rejects invalid note id', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/reports/${UUID}/notes/not-a-uuid`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: 'updated' }),
        },
      );
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/reports/:reportId/notes/reorder rejects empty noteIds', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/reports/${UUID}/notes/reorder`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteIds: [] }),
        },
      );
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/reports/:reportId/notes/reorder rejects non-UUID noteIds', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(
        `/api/v1/reports/${UUID}/notes/reorder`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteIds: ['not-a-uuid'] }),
        },
      );
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Integration tests (deferred until DB infra is available)
  // -------------------------------------------------------------------------
  describe.todo('integration: listNotes');
  describe.todo('integration: createNote');
  describe.todo('integration: updateNote');
  describe.todo('integration: deleteNote');
  describe.todo('integration: reorderNotes');
});
