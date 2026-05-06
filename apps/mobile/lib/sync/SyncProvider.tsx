/**
 * SyncProvider — opens the local SQLite handle on auth, runs migrations,
 * drives pull/push loops, and exposes the local DB + helpers via a React
 * context.
 *
 * Behavior:
 *   - Gated by `EXPO_PUBLIC_LOCAL_FIRST=1`. When unset, the provider is a
 *     transparent passthrough — `useSyncDb()` returns `{ db: null }` and
 *     callers fall back to the cloud-only path.
 *   - On the first auth user, opens `harpa-local-${userId}.db`, runs
 *     migrations, sets `db`. On user change, closes the previous handle.
 *   - Pull loop ticks every 30 s while online; push loop ticks every 5 s.
 *   - AppState→active triggers an immediate pull + push cycle.
 *   - `triggerPush()` lets mutations request an out-of-band push.
 *   - `onPushComplete(cb)` lets hooks invalidate caches when the engine
 *     reports newly-applied rows, so UI reflects server-confirmed state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { getDevFlags, subscribeDevFlags } from "@/lib/dev-flags";

import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import {
  deleteLocalDb,
  openLocalDb,
  runMigrations,
  type ExpoSqliteHandle,
  type SqlExecutor,
} from "@/lib/local-db";
import { isoClock, randomId, type Clock, type IdGen } from "@/lib/local-db/clock";
import {
  drainOutbox,
  type DrainResult,
} from "@/lib/sync/push-engine";
import {
  pullTable,
  type PullableTable,
} from "@/lib/sync/pull-engine";
import { PULLABLE_TABLES } from "@/lib/sync/pullable-tables";
import {
  makeMutationCaller,
  makePullFetcher,
  } from "@/lib/sync/supabase-bridge";

const PULL_INTERVAL_MS = 30_000;
const PUSH_INTERVAL_MS = 5_000;
const PUSH_NOTIFY_DEBOUNCE_MS = 250;

// Order matters: parents (projects → reports → file_metadata) first so
// child rows always have their FK targets locally when applied.
// `report_notes` references reports + project + file_metadata, so it
// pulls last.
//
// The rotation array itself lives in `pullable-tables.ts` so the
// schema-drift / rotation tests can import it without dragging in
// React + expo native modules from this file.

type PushCompleteListener = (result: DrainResult) => void;

export type PullCompleteResult = {
  /** Names of pullable tables that had at least one row applied this cycle. */
  tablesApplied: readonly string[];
};

type PullCompleteListener = (result: PullCompleteResult) => void;

export type SyncDbContext = {
  /** Local DB executor when local-first is enabled and ready; otherwise null. */
  db: SqlExecutor | null;
  isReady: boolean;
  /** Whether the device currently has internet connectivity. */
  isOnline: boolean;
  clock: Clock;
  newId: IdGen;
  /** Subscribe to push-completion events; returns an unsubscribe fn. */
  onPushComplete: (cb: PushCompleteListener) => () => void;
  /**
   * Subscribe to pull-completion events. Fires once per pull cycle when at
   * least one row was applied to local SQLite, with the list of tables
   * that received rows. Lets hooks invalidate React Query caches so the
   * UI reflects newly-pulled server data on first sign-in (when the local
   * cache is empty) and on subsequent reconciliation pulls.
   */
  onPullComplete: (cb: PullCompleteListener) => () => void;
  /** Request an immediate push drain (debounced internally). */
  triggerPush: () => void;
  /**
   * Request an immediate pull cycle. Used by pull-to-refresh in the UI
   * so users can force a server sync without waiting for the next
   * 30 s tick. No-op when local-first is disabled or DB isn't ready.
   */
  triggerPull: () => Promise<void>;
};

const passthrough: SyncDbContext = {
  db: null,
  isReady: false,
  isOnline: true,
  clock: isoClock,
  newId: randomId,
  onPushComplete: () => () => {},
  onPullComplete: () => () => {},
  triggerPush: () => {},
  triggerPull: async () => {},
};

const SyncCtx = createContext<SyncDbContext>(passthrough);

export function useSyncDb(): SyncDbContext {
  return useContext(SyncCtx);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [db, setDb] = useState<SqlExecutor | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const handleRef = useRef<ExpoSqliteHandle | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const subscribers = useRef<Set<PushCompleteListener>>(new Set());
  const pullSubscribers = useRef<Set<PullCompleteListener>>(new Set());
  const pullInFlight = useRef(false);
  const pushInFlight = useRef(false);
  const triggerPushRef = useRef<() => void>(() => {});
  const triggerPullRef = useRef<() => Promise<void>>(async () => {});
  const isOnlineRef = useRef(true);

  // Track connectivity via NetInfo. The dev-only `forceOffline` flag
  // (toggled from the Developer section in Profile, used by Maestro
  // offline flows) wins over the live NetInfo state — when it is on,
  // the provider behaves exactly as if the device just lost reachability.
  useEffect(() => {
    let lastNetOnline = true;
    const apply = () => {
      const forced = getDevFlags().forceOffline;
      const online = !forced && lastNetOnline;
      isOnlineRef.current = online;
      setIsOnline(online);
    };
    const unsubNet = NetInfo.addEventListener((state) => {
      lastNetOnline = !!(state.isConnected && state.isInternetReachable);
      apply();
    });
    const unsubFlags = subscribeDevFlags(apply);
    return () => {
      unsubNet();
      unsubFlags();
    };
  }, []);

  // Open / close the local DB on auth changes.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      // Logout (or no user yet). Tear down the handle and delete the
      // per-user SQLite file so the next user does not see stale data.
      const h = handleRef.current;
      const prevId = previousUserIdRef.current;
      handleRef.current = null;
      previousUserIdRef.current = null;
      setDb(null);
      setIsReady(false);
      void (async () => {
        if (h) await h.close().catch(() => {});
        if (prevId) await deleteLocalDb(prevId);
      })();
      return;
    }

    (async () => {
      try {
        const handle = await openLocalDb(userId);
        await runMigrations(handle.db);
        if (cancelled) {
          await handle.close();
          return;
        }
        handleRef.current = handle;
        previousUserIdRef.current = userId;
        setDb(handle.db);
        setIsReady(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[SyncProvider] open/migrate failed; falling back", err);
        setDb(null);
        setIsReady(false);
      }
    })();

    return () => {
      cancelled = true;
      const h = handleRef.current;
      handleRef.current = null;
      setDb(null);
      setIsReady(false);
      if (h) void h.close().catch(() => {});
    };
  }, [userId]);

  // Pull / push loops.
  useEffect(() => {
    if (!db || !userId) return;

    const fetcher = makePullFetcher(backend);
    const caller = makeMutationCaller(backend);

    let pullPromise: Promise<void> | null = null;
    const runPull = async () => {
      if (!isOnlineRef.current) return;
      if (pullPromise) return pullPromise;

      pullInFlight.current = true;
      const tablesApplied: string[] = [];

      pullPromise = (async () => {
        try {
          for (const table of PULLABLE_TABLES) {
            const result = await pullTable({
              db,
              table,
              fetcher,
              userId,
              limit: 500,
            });
            if (result.rowsApplied > 0) {
              tablesApplied.push(result.table);
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[SyncProvider] pull failed", err);
        } finally {
          pullInFlight.current = false;
          pullPromise = null;
        }

        if (tablesApplied.length > 0) {
          const event: PullCompleteResult = { tablesApplied };
          for (const cb of pullSubscribers.current) {
            try {
              cb(event);
            } catch {
              /* ignore */
            }
          }
        }

      })();

      return pullPromise;
    };

    // Trailing-edge debounce for subscriber notification. Successive
    // drains within `PUSH_NOTIFY_DEBOUNCE_MS` are coalesced into one
    // callback invocation per subscriber so a rapid mutation burst
    // does not cause N React Query invalidations.
    const pendingResults: DrainResult[] = [];
    let notifyTimer: ReturnType<typeof setTimeout> | null = null;
    const flushNotifications = () => {
      notifyTimer = null;
      if (pendingResults.length === 0) return;
      const merged = pendingResults.reduce<DrainResult>(
        (acc, r) => ({
          applied: acc.applied + r.applied,
          duplicates: acc.duplicates + r.duplicates,
          conflicts: acc.conflicts + r.conflicts,
          forbidden: acc.forbidden + r.forbidden,
          retried: acc.retried + r.retried,
          permanentlyFailed: acc.permanentlyFailed + r.permanentlyFailed,
        }),
        {
          applied: 0,
          duplicates: 0,
          conflicts: 0,
          forbidden: 0,
          retried: 0,
          permanentlyFailed: 0,
        },
      );
      pendingResults.length = 0;
      for (const cb of subscribers.current) {
        try {
          cb(merged);
        } catch {
          /* ignore */
        }
      }
    };
    const queueNotify = (result: DrainResult) => {
      pendingResults.push(result);
      if (notifyTimer) return;
      notifyTimer = setTimeout(flushNotifications, PUSH_NOTIFY_DEBOUNCE_MS);
    };

    const runPush = async () => {
      if (pushInFlight.current || !isOnlineRef.current) return;
      pushInFlight.current = true;
      try {
        const result = await drainOutbox({
          db,
          caller,
          now: isoClock,
        });
        if (
          result.applied + result.duplicates + result.conflicts + result.forbidden >
          0
        ) {
          queueNotify(result);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[SyncProvider] push failed", err);
      } finally {
        pushInFlight.current = false;
      }
    };

    triggerPushRef.current = () => {
      void runPush();
    };

    triggerPullRef.current = () => runPull();

    const pullId = setInterval(runPull, PULL_INTERVAL_MS);
    const pushId = setInterval(runPush, PUSH_INTERVAL_MS);

    // Initial cycle on mount.
    void runPull();
    void runPush();

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void runPull();
        void runPush();
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    // Trigger an immediate cycle on reconnect. We also listen to the dev
    // `forceOffline` flag so that turning it off in the Developer section
    // (or via Maestro) drives the same reconnect cycle even when the
    // underlying NetInfo state never changed.
    const netInfoUnsub = NetInfo.addEventListener((state) => {
      const reachable =
        !!(state.isConnected && state.isInternetReachable) &&
        !getDevFlags().forceOffline;
      if (reachable) {
        void runPull();
        void runPush();
      }
    });
    let lastForcedOffline = getDevFlags().forceOffline;
    const flagsUnsub = subscribeDevFlags(() => {
      const nowForced = getDevFlags().forceOffline;
      if (lastForcedOffline && !nowForced) {
        void runPull();
        void runPush();
      }
      lastForcedOffline = nowForced;
    });

    return () => {
      clearInterval(pullId);
      clearInterval(pushId);
      sub.remove();
      netInfoUnsub();
      flagsUnsub();
      if (notifyTimer) {
        clearTimeout(notifyTimer);
        notifyTimer = null;
        // Drop any pending merged result on unmount; subscribers go
        // away with the provider.
        pendingResults.length = 0;
      }
      triggerPushRef.current = () => {};
      triggerPullRef.current = async () => {};
    };
  }, [db, userId]);

  const onPushComplete = useCallback((cb: PushCompleteListener) => {
    subscribers.current.add(cb);
    return () => {
      subscribers.current.delete(cb);
    };
  }, []);

  const onPullComplete = useCallback((cb: PullCompleteListener) => {
    pullSubscribers.current.add(cb);
    return () => {
      pullSubscribers.current.delete(cb);
    };
  }, []);

  const triggerPush = useCallback(() => {
    triggerPushRef.current();
  }, []);

  const triggerPull = useCallback(() => {
    return triggerPullRef.current();
  }, []);

  const value = useMemo<SyncDbContext>(
    () => ({
      db,
      isReady,
      isOnline,
      clock: isoClock,
      newId: randomId,
      onPushComplete,
      onPullComplete,
      triggerPush,
      triggerPull,
    }),
    [
      db,
      isReady,
      isOnline,
      onPushComplete,
      onPullComplete,
      triggerPush,
      triggerPull,
    ],
  );

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}
