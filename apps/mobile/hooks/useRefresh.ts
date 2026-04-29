/**
 * Shared pull-to-refresh hook.
 *
 * Manages the `refreshing` boolean for `RefreshControl` and, on each
 * pull-down, fires:
 *   1. `triggerPull()` from SyncProvider — forces an immediate server
 *      pull cycle in local-first mode (no-op when local-first is off).
 *   2. Each provided refetcher (typically the `refetch` function
 *      returned by `useQuery`) in parallel via `Promise.allSettled`.
 *
 * Errors are swallowed to match the existing sync philosophy
 * (`[SyncProvider] pull failed` is also non-fatal); the spinner
 * always releases.
 */
import { useCallback, useState } from "react";

import { useSyncDb } from "@/lib/sync/SyncProvider";

export type Refetcher = () => Promise<unknown>;

export function useRefresh(refetchers: readonly Refetcher[]) {
  const { triggerPull } = useSyncDb();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    triggerPull();
    void Promise.allSettled(refetchers.map((fn) => fn())).finally(() => {
      setRefreshing(false);
    });
  }, [triggerPull, refetchers]);

  return { refreshing, onRefresh };
}
