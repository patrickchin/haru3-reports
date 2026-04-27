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

import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import {
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
  PROJECTS_PULLABLE,
  REPORTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  FILE_METADATA_PULLABLE,
  type PullableTable,
} from "@/lib/sync/pull-engine";
import {
  makeMutationCaller,
  makePullFetcher,
} from "@/lib/sync/supabase-bridge";

const PULL_INTERVAL_MS = 30_000;
const PUSH_INTERVAL_MS = 5_000;

const PULLABLE_TABLES: readonly PullableTable[] = [
  PROJECTS_PULLABLE,
  REPORTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  FILE_METADATA_PULLABLE,
];

type PushCompleteListener = (result: DrainResult) => void;

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
  /** Request an immediate push drain (debounced internally). */
  triggerPush: () => void;
};

const passthrough: SyncDbContext = {
  db: null,
  isReady: false,
  isOnline: true,
  clock: isoClock,
  newId: randomId,
  onPushComplete: () => () => {},
  triggerPush: () => {},
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
  const subscribers = useRef<Set<PushCompleteListener>>(new Set());
  const pullInFlight = useRef(false);
  const pushInFlight = useRef(false);
  const triggerPushRef = useRef<() => void>(() => {});
  const isOnlineRef = useRef(true);

  // Track connectivity via NetInfo.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable);
      isOnlineRef.current = online;
      setIsOnline(online);
    });
    return unsub;
  }, []);

  // Open / close the local DB on auth changes.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      // Tear down any open handle.
      const h = handleRef.current;
      handleRef.current = null;
      setDb(null);
      setIsReady(false);
      if (h) void h.close().catch(() => {});
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

    const runPull = async () => {
      if (pullInFlight.current || !isOnlineRef.current) return;
      pullInFlight.current = true;
      try {
        for (const table of PULLABLE_TABLES) {
          await pullTable({
            db,
            table,
            fetcher,
            userId,
            limit: 500,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[SyncProvider] pull failed", err);
      } finally {
        pullInFlight.current = false;
      }
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
          for (const cb of subscribers.current) {
            try {
              cb(result);
            } catch {
              /* ignore */
            }
          }
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

    // Trigger an immediate cycle on reconnect.
    const netInfoUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        void runPull();
        void runPush();
      }
    });

    return () => {
      clearInterval(pullId);
      clearInterval(pushId);
      sub.remove();
      netInfoUnsub();
      triggerPushRef.current = () => {};
    };
  }, [db, userId]);

  const onPushComplete = useCallback((cb: PushCompleteListener) => {
    subscribers.current.add(cb);
    return () => {
      subscribers.current.delete(cb);
    };
  }, []);

  const triggerPush = useCallback(() => {
    triggerPushRef.current();
  }, []);

  const value = useMemo<SyncDbContext>(
    () => ({
      db,
      isReady,
      isOnline,
      clock: isoClock,
      newId: randomId,
      onPushComplete,
      triggerPush,
    }),
    [db, isReady, isOnline, onPushComplete, triggerPush],
  );

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}
