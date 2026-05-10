/**
 * Shared pull-to-refresh hook.
 *
 * Manages the `refreshing` boolean for `RefreshControl` and, on each
 * pull-down, runs each provided refetcher (typically the `refetch`
 * function returned by `useQuery`) in parallel via
 * `Promise.allSettled`. Errors are swallowed so the spinner always
 * releases.
 */
import { useCallback, useState } from "react";

export type Refetcher = () => Promise<unknown>;

export function useRefresh(refetchers: readonly Refetcher[]) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.allSettled(refetchers.map((fn) => fn()))
      .finally(() => {
        setRefreshing(false);
      });
  }, [refetchers]);

  return { refreshing, onRefresh };
}
