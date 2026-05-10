import { use$ } from '@legendapp/state/react';
import { auth$ } from '@/lib/state/observables';

/** Reactive auth state derived from the auth$ observable. */
export function useAuth() {
  const session = use$(auth$.session);
  const user = use$(auth$.user);
  const profile = use$(auth$.profile);
  const isLoading = use$(auth$.isLoading);
  const isInitialized = use$(auth$.isInitialized);

  return {
    session,
    user,
    profile,
    isLoading,
    isInitialized,
    isAuthenticated: !!session,
  };
}
