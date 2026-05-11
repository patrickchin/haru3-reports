import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@supabase/supabase-js';
import {
  getSupabaseAdmin,
  createPresignedUploadUrl,
  createSignedDownloadUrl,
  downloadFile,
} from '../supabase.js';

const mockCreateClient = vi.mocked(createClient);

describe('supabase lib', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.SUPABASE_URL = process.env.SUPABASE_URL;
    savedEnv.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  // The module caches the client singleton. We need to re-import to reset it.
  // Instead, we test the error paths and the storage helper logic.

  describe('getSupabaseAdmin', () => {
    it('throws when SUPABASE_URL is not set', async () => {
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      // Need a fresh import to avoid singleton cache
      vi.resetModules();
      const { getSupabaseAdmin: freshGet } = await import('../supabase.js');
      expect(() => freshGet()).toThrow('SUPABASE_URL not configured');
    });

    it('throws when SUPABASE_SERVICE_ROLE_KEY is not set', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      vi.resetModules();
      const { getSupabaseAdmin: freshGet } = await import('../supabase.js');
      expect(() => freshGet()).toThrow('SUPABASE_SERVICE_ROLE_KEY not configured');
    });

    it('returns a client when both env vars are set', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

      vi.resetModules();
      // Re-mock after resetModules
      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue({ storage: {} }),
      }));

      const { getSupabaseAdmin: freshGet } = await import('../supabase.js');
      const client = freshGet();
      expect(client).toBeDefined();

      // Second call returns same instance (singleton)
      const client2 = freshGet();
      expect(client2).toBe(client);
    });
  });

  describe('createPresignedUploadUrl', () => {
    it('throws when storage returns an error', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      vi.resetModules();
      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue({
          storage: {
            from: vi.fn().mockReturnValue({
              createSignedUploadUrl: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'bucket not found' },
              }),
            }),
          },
        }),
      }));

      const { createPresignedUploadUrl: fn } = await import('../supabase.js');
      await expect(fn('bucket', 'path/file.txt')).rejects.toThrow(
        'Presign upload failed: bucket not found',
      );
    });

    it('returns signedUrl and token on success', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      vi.resetModules();
      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue({
          storage: {
            from: vi.fn().mockReturnValue({
              createSignedUploadUrl: vi.fn().mockResolvedValue({
                data: { signedUrl: 'https://signed.url', token: 'tok-123' },
                error: null,
              }),
            }),
          },
        }),
      }));

      const { createPresignedUploadUrl: fn } = await import('../supabase.js');
      const result = await fn('project-files', 'path/file.txt');
      expect(result.signedUrl).toBe('https://signed.url');
      expect(result.token).toBe('tok-123');
    });
  });

  describe('createSignedDownloadUrl', () => {
    it('throws when storage returns an error', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      vi.resetModules();
      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue({
          storage: {
            from: vi.fn().mockReturnValue({
              createSignedUrl: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'not found' },
              }),
            }),
          },
        }),
      }));

      const { createSignedDownloadUrl: fn } = await import('../supabase.js');
      await expect(fn('bucket', 'path')).rejects.toThrow(
        'Signed URL failed: not found',
      );
    });

    it('returns the signed URL on success', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      vi.resetModules();
      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue({
          storage: {
            from: vi.fn().mockReturnValue({
              createSignedUrl: vi.fn().mockResolvedValue({
                data: { signedUrl: 'https://download.url' },
                error: null,
              }),
            }),
          },
        }),
      }));

      const { createSignedDownloadUrl: fn } = await import('../supabase.js');
      const url = await fn('bucket', 'path', 7200);
      expect(url).toBe('https://download.url');
    });
  });

  describe('downloadFile', () => {
    it('throws when download fails', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      vi.resetModules();
      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue({
          storage: {
            from: vi.fn().mockReturnValue({
              download: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'file not found' },
              }),
            }),
          },
        }),
      }));

      const { downloadFile: fn } = await import('../supabase.js');
      await expect(fn('bucket', 'path')).rejects.toThrow(
        'File download failed: file not found',
      );
    });

    it('returns buffer and mimeType on success', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      const content = new Uint8Array([1, 2, 3]);
      const blob = new Blob([content], { type: 'audio/mp4' });

      vi.resetModules();
      vi.doMock('@supabase/supabase-js', () => ({
        createClient: vi.fn().mockReturnValue({
          storage: {
            from: vi.fn().mockReturnValue({
              download: vi.fn().mockResolvedValue({
                data: blob,
                error: null,
              }),
            }),
          },
        }),
      }));

      const { downloadFile: fn } = await import('../supabase.js');
      const result = await fn('bucket', 'path');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.mimeType).toBe('audio/mp4');
    });
  });
});
