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
  try {
    const { data } = await api.GET('/api/v1/profile', {});
    if (data) {
      auth$.profile.set((data as any).data ?? data);
    }
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}
