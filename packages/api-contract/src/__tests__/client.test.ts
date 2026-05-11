import { describe, it, expect } from 'vitest';
import { createApiClient, type ApiClient } from '../client';

// ---------------------------------------------------------------------------
// createApiClient
// ---------------------------------------------------------------------------

describe('createApiClient', () => {
  it('returns a client object', () => {
    const client = createApiClient('https://api.example.com', async () => null);
    expect(client).toBeDefined();
    expect(typeof client).toBe('object');
  });

  it('client has standard HTTP method helpers', () => {
    const client = createApiClient('https://api.example.com', async () => null);
    expect(typeof client.GET).toBe('function');
    expect(typeof client.POST).toBe('function');
    expect(typeof client.PUT).toBe('function');
    expect(typeof client.DELETE).toBe('function');
    expect(typeof client.PATCH).toBe('function');
  });

  it('ApiClient type is assignable from createApiClient return', () => {
    const client: ApiClient = createApiClient(
      'https://api.example.com',
      async () => 'token',
    );
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Re-exports from index
// ---------------------------------------------------------------------------

describe('package entry point re-exports', () => {
  it('re-exports createApiClient and ApiClient', async () => {
    const mod = await import('../index');
    expect(mod.createApiClient).toBe(createApiClient);
  });

  it('re-exports all constants', async () => {
    const mod = await import('../index');
    expect(mod.AI_PROVIDERS).toBeDefined();
    expect(mod.DEFAULT_PROVIDER).toBeDefined();
    expect(mod.PROVIDER_MODELS).toBeDefined();
    expect(mod.REPORT_TYPES).toBeDefined();
    expect(mod.REPORT_STATUSES).toBeDefined();
    expect(mod.PROJECT_STATUSES).toBeDefined();
    expect(mod.PROJECT_ROLES).toBeDefined();
    expect(mod.MEMBER_ROLES).toBeDefined();
    expect(mod.FILE_CATEGORIES).toBeDefined();
    expect(mod.NOTE_KINDS).toBeDefined();
    expect(mod.UPLOAD_STATUSES).toBeDefined();
    expect(mod.STORAGE_BUCKETS).toBeDefined();
  });

  it('re-exports error utilities', async () => {
    const mod = await import('../index');
    expect(mod.isApiError).toBeDefined();
    expect(mod.getErrorMessage).toBeDefined();
    expect(mod.ApiError).toBeDefined();
  });
});
