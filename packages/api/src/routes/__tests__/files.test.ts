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

describe('Files routes', () => {
  const app = createApp();

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------
  describe('auth enforcement', () => {
    it('GET /api/v1/projects/:projectId/files requires auth', async () => {
      const res = await app.request(`/api/v1/projects/${UUID}/files`);
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/uploads/presign requires auth', async () => {
      const res = await app.request('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'test.jpg', mimeType: 'image/jpeg', category: 'image' }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/files requires auth', async () => {
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: UUID,
          storagePath: 'test/path.jpg',
          category: 'image',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/files/:id requires auth', async () => {
      const res = await app.request(`/api/v1/files/${UUID}`);
      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/files/:id requires auth', async () => {
      const res = await app.request(`/api/v1/files/${UUID}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/voice-notes/:fileId/transcribe requires auth', async () => {
      const res = await app.request(`/api/v1/voice-notes/${UUID}/transcribe`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/voice-notes/:fileId/summarize requires auth', async () => {
      const res = await app.request(`/api/v1/voice-notes/${UUID}/summarize`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });

    it('rejects expired JWT tokens', async () => {
      const headers = await testAuthHeader({ exp: Math.floor(Date.now() / 1000) - 60 });
      const res = await app.request(`/api/v1/files/${UUID}`, { headers });
      expect(res.status).toBe(401);
    });

    it('rejects malformed Bearer token', async () => {
      const res = await app.request(`/api/v1/files/${UUID}`, {
        headers: { Authorization: 'Bearer not.a.valid.jwt' },
      });
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    // -- presign upload --
    it('POST /api/v1/uploads/presign rejects missing fileName', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: 'image/jpeg', category: 'image' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/uploads/presign rejects empty fileName', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: '', mimeType: 'image/jpeg', category: 'image' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/uploads/presign rejects missing mimeType', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'test.jpg', category: 'image' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/uploads/presign rejects missing category', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'test.jpg', mimeType: 'image/jpeg' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/uploads/presign rejects invalid category', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'test.jpg', mimeType: 'image/jpeg', category: 'bogus' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/uploads/presign rejects empty body', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/uploads/presign', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    // -- create file --
    it('POST /api/v1/files rejects invalid projectId', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'not-a-uuid',
          storagePath: 'test/path.jpg',
          category: 'image',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/files rejects invalid category', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: UUID,
          storagePath: 'test/path.jpg',
          category: 'invalid-category',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/files rejects missing required fields', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: UUID }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/files rejects empty storagePath', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: UUID,
          storagePath: '',
          category: 'image',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/files rejects empty filename', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: UUID,
          storagePath: 'test/path.jpg',
          category: 'image',
          filename: '',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/files rejects negative sizeBytes', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: UUID,
          storagePath: 'test/path.jpg',
          category: 'image',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: -1,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/files rejects non-integer sizeBytes', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: UUID,
          storagePath: 'test/path.jpg',
          category: 'image',
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1.5,
        }),
      });
      expect(res.status).toBe(400);
    });

    // -- UUID param validation --
    it('GET /api/v1/files/not-a-uuid rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files/not-a-uuid', {
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('DELETE /api/v1/files/not-a-uuid rejects invalid UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/files/not-a-uuid', {
        method: 'DELETE',
        headers,
      });
      expect(res.status).toBe(400);
    });

    // -- list files query params --
    it('GET list files rejects invalid projectId param', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/projects/not-a-uuid/files', {
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('GET list files rejects invalid category query', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}/files?category=bogus`, {
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('GET list files rejects limit=0', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}/files?limit=0`, {
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('GET list files rejects limit > 100', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}/files?limit=101`, {
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('GET list files rejects non-numeric limit', async () => {
      const headers = await testAuthHeader();
      const res = await app.request(`/api/v1/projects/${UUID}/files?limit=abc`, {
        headers,
      });
      expect(res.status).toBe(400);
    });

    // -- voice notes UUID param --
    it('POST transcribe rejects invalid fileId UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/voice-notes/not-a-uuid/transcribe', {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(400);
    });

    it('POST summarize rejects invalid fileId UUID', async () => {
      const headers = await testAuthHeader();
      const res = await app.request('/api/v1/voice-notes/not-a-uuid/summarize', {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Happy-path integration tests (deferred until DB infra is available)
  // -------------------------------------------------------------------------
  describe.todo('integration: listFiles');
  describe.todo('integration: presignUpload');
  describe.todo('integration: createFile');
  describe.todo('integration: getFile');
  describe.todo('integration: deleteFile');
  describe.todo('integration: transcribeVoiceNote');
  describe.todo('integration: summarizeVoiceNote');
});
