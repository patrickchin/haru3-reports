import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock React hooks as identity functions (no renderer needed)
// ---------------------------------------------------------------------------

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useCallback: (fn: any) => fn,
  };
});

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSignOut = vi.fn();
const mockApiGET = vi.fn();
const mockApiPATCH = vi.fn();

vi.mock('@/lib/api/client', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: any[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: any[]) => mockVerifyOtp(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
    },
  },
  api: {
    GET: (...args: any[]) => mockApiGET(...args),
    PATCH: (...args: any[]) => mockApiPATCH(...args),
  },
}));

const mockAuthSet = vi.fn();
const mockProfileSet = vi.fn();

vi.mock('@/lib/state/observables', () => ({
  auth$: {
    set: (...args: any[]) => mockAuthSet(...args),
    profile: { set: (...args: any[]) => mockProfileSet(...args) },
  },
}));

const { useAuthActions } = await import('../useAuthActions');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuthActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- signInWithOtp ------------------------------------------------------

  describe('signInWithOtp', () => {
    it('calls supabase.auth.signInWithOtp with phone', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });
      const { signInWithOtp } = useAuthActions();

      await signInWithOtp('+15551234567');

      expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+15551234567' });
    });

    it('throws when supabase returns an error', async () => {
      const authError = new Error('Rate limit');
      mockSignInWithOtp.mockResolvedValue({ error: authError });
      const { signInWithOtp } = useAuthActions();

      await expect(signInWithOtp('+15551234567')).rejects.toThrow('Rate limit');
    });
  });

  // ---- verifyOtp ----------------------------------------------------------

  describe('verifyOtp', () => {
    it('calls supabase.auth.verifyOtp with phone, token, type', async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockApiGET.mockResolvedValue({ data: { data: { id: 'u1' } }, error: null });
      const { verifyOtp } = useAuthActions();

      await verifyOtp('+15551234567', '123456');

      expect(mockVerifyOtp).toHaveBeenCalledWith({
        phone: '+15551234567',
        token: '123456',
        type: 'sms',
      });
    });

    it('throws when verifyOtp returns an error', async () => {
      const authError = new Error('Invalid OTP');
      mockVerifyOtp.mockResolvedValue({ error: authError });
      const { verifyOtp } = useAuthActions();

      await expect(verifyOtp('+1', '000000')).rejects.toThrow('Invalid OTP');
    });

    it('returns profile and sets auth$ when profile exists', async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      const profile = { id: 'u1', fullName: 'Alice' };
      mockApiGET.mockResolvedValue({ data: { data: profile }, error: null });
      const { verifyOtp } = useAuthActions();

      const result = await verifyOtp('+1', '123456');

      expect(result).toEqual(profile);
      expect(mockProfileSet).toHaveBeenCalledWith(profile);
    });

    it('returns null for 404 profile (new user)', async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockApiGET.mockResolvedValue({ data: null, error: { status: 404 } });
      const { verifyOtp } = useAuthActions();

      const result = await verifyOtp('+1', '123456');

      expect(result).toBeNull();
    });

    it('throws for non-404 profile errors', async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockApiGET.mockResolvedValue({ data: null, error: { status: 500 } });
      const { verifyOtp } = useAuthActions();

      await expect(verifyOtp('+1', '123456')).rejects.toThrow(
        'Unable to load your account. Please try again.',
      );
    });

    it('returns null without setting profile when data is empty', async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      mockApiGET.mockResolvedValue({ data: null, error: null });
      const { verifyOtp } = useAuthActions();

      const result = await verifyOtp('+1', '123456');

      expect(result).toBeNull();
      expect(mockProfileSet).not.toHaveBeenCalled();
    });
  });

  // ---- signOut ------------------------------------------------------------

  describe('signOut', () => {
    it('calls supabase.auth.signOut and resets auth$', async () => {
      mockSignOut.mockResolvedValue({});
      const { signOut } = useAuthActions();

      await signOut();

      expect(mockSignOut).toHaveBeenCalled();
      expect(mockAuthSet).toHaveBeenCalledWith({
        session: null,
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
      });
    });
  });

  // ---- updateProfile ------------------------------------------------------

  describe('updateProfile', () => {
    it('calls api.PATCH with mapped field names', async () => {
      mockApiPATCH.mockResolvedValue({ data: { id: 'u1', full_name: 'Bob' } });
      const { updateProfile } = useAuthActions();

      await updateProfile({ fullName: 'Bob', companyName: 'ACME' });

      expect(mockApiPATCH).toHaveBeenCalledWith('/api/v1/profile', {
        body: { full_name: 'Bob', company_name: 'ACME' },
      });
    });

    it('sets auth$.profile when PATCH returns data', async () => {
      const updated = { id: 'u1', full_name: 'Bob' };
      mockApiPATCH.mockResolvedValue({ data: updated });
      const { updateProfile } = useAuthActions();

      await updateProfile({ fullName: 'Bob' });

      expect(mockProfileSet).toHaveBeenCalledWith(updated);
    });

    it('does not set profile when PATCH returns no data', async () => {
      mockApiPATCH.mockResolvedValue({ data: null });
      const { updateProfile } = useAuthActions();

      await updateProfile({ fullName: 'Bob' });

      expect(mockProfileSet).not.toHaveBeenCalled();
    });

    it('only includes provided fields in body', async () => {
      mockApiPATCH.mockResolvedValue({ data: null });
      const { updateProfile } = useAuthActions();

      await updateProfile({ fullName: 'Bob' });

      expect(mockApiPATCH).toHaveBeenCalledWith('/api/v1/profile', {
        body: { full_name: 'Bob' },
      });
    });
  });
});
