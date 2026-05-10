import { useCallback } from 'react';
import { supabase, api } from '@/lib/api/client';
import { auth$ } from '@/lib/state/observables';

/** Imperative auth actions (sign-in, verify, sign-out, profile update). */
export function useAuthActions() {
  const signInWithOtp = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error) throw error;

    // Fetch profile immediately so the caller can route without waiting
    // for the background AuthProvider listener.
    const { data, error: profileError } = await api.GET('/api/v1/profile', {});

    if (profileError) {
      const status =
        (profileError as any)?.status ?? (profileError as any)?.code;
      if (status !== 404) {
        throw new Error('Unable to load your account. Please try again.');
      }
      // 404 → new user, return null so caller routes to onboarding.
      return null;
    }

    const profile = (data as any)?.data ?? data ?? null;
    if (profile) {
      auth$.profile.set(profile);
    }
    return profile;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    auth$.set({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
      isInitialized: true,
    });
  }, []);

  const updateProfile = useCallback(
    async (data: { fullName?: string; companyName?: string }) => {
      const body: Record<string, string> = {};
      if (data.fullName !== undefined) body.full_name = data.fullName;
      if (data.companyName !== undefined) body.company_name = data.companyName;

      const { data: updated } = await api.PATCH('/api/v1/profile', {
        body: body as any,
      });

      if (updated) {
        auth$.profile.set(updated as any);
      }
    },
    [],
  );

  return { signInWithOtp, verifyOtp, signOut, updateProfile };
}
