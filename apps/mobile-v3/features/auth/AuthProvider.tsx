import { useEffect } from 'react';
import { supabase, api } from '@/lib/api/client';
import { auth$ } from '@/lib/state/observables';

/**
 * AuthProvider — manages Supabase auth state and keeps
 * the auth$ observable in sync. Renders children directly
 * (no React context needed since state lives in observables).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session) {
          auth$.session.set(session);
          auth$.user.set(session.user);
          await loadProfile();
        }
      } catch (err) {
        console.error('Auth init failed:', err);
      } finally {
        if (mounted) {
          auth$.isLoading.set(false);
          auth$.isInitialized.set(true);
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        auth$.session.set(session);
        auth$.user.set(session?.user ?? null);

        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          await loadProfile();
        }

        if (event === 'SIGNED_OUT') {
          auth$.profile.set(null);
        }
      },
    );

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}

async function loadProfile() {
  const { data, error } = await api.GET('/api/v1/profile', {});

  if (error) {
    // 404 is expected for brand-new users who haven't onboarded yet.
    // Any other error (401, 500, network) is a real failure — sign the
    // user out so the app doesn't silently land on onboarding with a
    // broken session.
    const status = (error as any)?.status ?? (error as any)?.code;
    if (status !== 404) {
      console.error('Failed to load profile, signing out:', error);
      await supabase.auth.signOut();
      return;
    }

    // 404 → new user, profile stays null → onboarding screen.
    return;
  }

  if (data) {
    auth$.profile.set((data as any).data ?? data);
  }
}
