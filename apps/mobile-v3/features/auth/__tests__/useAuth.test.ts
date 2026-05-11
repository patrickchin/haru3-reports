import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock observables
// ---------------------------------------------------------------------------

const mockAuth = {
  session: null as any,
  user: null as any,
  profile: null as any,
  isLoading: true,
  isInitialized: false,
};

vi.mock('@/lib/state/observables', () => ({
  auth$: {
    session: { get: () => mockAuth.session },
    user: { get: () => mockAuth.user },
    profile: { get: () => mockAuth.profile },
    isLoading: { get: () => mockAuth.isLoading },
    isInitialized: { get: () => mockAuth.isInitialized },
  },
}));

vi.mock('@legendapp/state/react', () => ({
  use$: (obs: { get: () => unknown }) => obs.get(),
}));

const { useAuth } = await import('../useAuth');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  beforeEach(() => {
    mockAuth.session = null;
    mockAuth.user = null;
    mockAuth.profile = null;
    mockAuth.isLoading = true;
    mockAuth.isInitialized = false;
  });

  it('returns isAuthenticated=false when session is null', () => {
    const state = useAuth();
    expect(state.isAuthenticated).toBe(false);
    expect(state.session).toBeNull();
  });

  it('returns isAuthenticated=true when session exists', () => {
    mockAuth.session = { access_token: 'tok', user: { id: 'u1' } };
    const state = useAuth();
    expect(state.isAuthenticated).toBe(true);
  });

  it('returns loading state', () => {
    mockAuth.isLoading = true;
    mockAuth.isInitialized = false;
    const state = useAuth();
    expect(state.isLoading).toBe(true);
    expect(state.isInitialized).toBe(false);
  });

  it('returns user and profile when available', () => {
    mockAuth.user = { id: 'u1', email: 'a@b.com' };
    mockAuth.profile = { id: 'u1', phone: '+1', fullName: 'Alice', companyName: null, avatarUrl: null };

    const state = useAuth();
    expect(state.user).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(state.profile?.fullName).toBe('Alice');
  });

  it('returns initialized + not loading when auth completes', () => {
    mockAuth.isLoading = false;
    mockAuth.isInitialized = true;
    mockAuth.session = { access_token: 'tok' };

    const state = useAuth();
    expect(state.isLoading).toBe(false);
    expect(state.isInitialized).toBe(true);
    expect(state.isAuthenticated).toBe(true);
  });
});
