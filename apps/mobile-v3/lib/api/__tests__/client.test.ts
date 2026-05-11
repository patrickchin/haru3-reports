import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// We test client.ts by mocking its dependencies and inspecting calls.
// Since the module is evaluated once per vi.resetModules() cycle, we
// re-import fresh in each test.
// ---------------------------------------------------------------------------

const mockCreateClientCalls: any[][] = [];
const mockCreateApiClientCalls: any[][] = [];

let mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'test-token-123' } },
});

beforeEach(() => {
  vi.resetModules();
  mockCreateClientCalls.length = 0;
  mockCreateApiClientCalls.length = 0;
  mockGetSession = vi.fn().mockResolvedValue({
    data: { session: { access_token: 'test-token-123' } },
  });

  vi.doMock('@supabase/supabase-js', () => ({
    createClient: (...args: any[]) => {
      mockCreateClientCalls.push(args);
      return {
        auth: { getSession: mockGetSession },
      };
    },
  }));

  vi.doMock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
  }));

  vi.doMock('@harpa/api-contract', () => ({
    createApiClient: (...args: any[]) => {
      mockCreateApiClientCalls.push(args);
      return { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), use: vi.fn() };
    },
  }));

  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test.com';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lib/api/client', () => {
  it('creates supabase client with correct URL and anon key', async () => {
    await import('../client');

    expect(mockCreateClientCalls).toHaveLength(1);
    expect(mockCreateClientCalls[0][0]).toBe('https://test.supabase.co');
    expect(mockCreateClientCalls[0][1]).toBe('test-anon-key');
  });

  it('passes correct auth config to supabase', async () => {
    await import('../client');

    const authConfig = mockCreateClientCalls[0][2].auth;
    expect(authConfig.autoRefreshToken).toBe(true);
    expect(authConfig.persistSession).toBe(true);
    expect(authConfig.detectSessionInUrl).toBe(false);
  });

  it('passes AsyncStorage to supabase auth config', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await import('../client');

    const authConfig = mockCreateClientCalls[0][2].auth;
    expect(authConfig.storage).toBe(AsyncStorage);
  });

  it('creates API client with the configured base URL', async () => {
    await import('../client');

    expect(mockCreateApiClientCalls).toHaveLength(1);
    expect(mockCreateApiClientCalls[0][0]).toBe('https://api.test.com');
  });

  it('passes a getToken function to createApiClient', async () => {
    await import('../client');

    const getTokenFn = mockCreateApiClientCalls[0][1];
    expect(typeof getTokenFn).toBe('function');
  });

  it('getToken returns access_token from supabase session', async () => {
    await import('../client');

    const getTokenFn = mockCreateApiClientCalls[0][1];
    const token = await getTokenFn();
    expect(token).toBe('test-token-123');
  });

  it('getToken returns null when no session exists', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    await import('../client');

    const getTokenFn = mockCreateApiClientCalls[0][1];
    const token = await getTokenFn();
    expect(token).toBeNull();
  });

  it('exports supabase and api objects', async () => {
    const mod = await import('../client');
    expect(mod.supabase).toBeDefined();
    expect(mod.api).toBeDefined();
  });
});
