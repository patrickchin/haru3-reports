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
import { GenerationWorker } from "@/lib/sync/generation-worker";
import { runGenerationOnce } from "@/lib/sync/generation-driver";
import {
  enqueueJob,
  type JobMode,
} from "@/lib/sync/generation-jobs-repo";
import { makeGenerateFn } from "@/lib/sync/make-generate-fn";
import type {
  GenerationContext,
  NetType,
} from "@/lib/sync/generation-policy";
import { getStoredProvider, getStoredModel } from "@/hooks/useAiProvider";

const PULL_INTERVAL_MS = 30_000;
const PUSH_INTERVAL_MS = 5_000;
const GENERATION_INTERVAL_MS = 15_000;
const PUSH_NOTIFY_DEBOUNCE_MS = 250;

const PULLABLE_TABLES: readonly PullableTable[] = [
  PROJECTS_PULLABLE,
  REPORTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  FILE_METADATA_PULLABLE,
];

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
  /**
   * Enqueue a deferred report-generation job and trigger an immediate
   * driver pass. No-op when local-first is disabled or DB isn't ready.
   */
  triggerGeneration: (reportId: string, mode?: JobMode) => void;
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
  triggerGeneration: () => {},
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
  const generationInFlight = useRef(false);
  const triggerPushRef = useRef<() => void>(() => {});
  const triggerPullRef = useRef<() => Promise<void>>(async () => {});
  const triggerGenerationRef = useRef<(reportId: string, mode?: JobMode) => void>(
    () => {},
  );
  const isOnlineRef = useRef(true);
  const netTypeRef = useRef<NetType>("unknown");
  const appStateRef = useRef<"active" | "background" | "inactive">(
    "active",
  );

  // Track connectivity via NetInfo.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable);
      isOnlineRef.current = online;
      netTypeRef.current = mapNetType(state.type);
      setIsOnline(online);
    });
    return unsub;
  }, []);

  // Track AppState for the generation policy gate.
  useEffect(() => {
    appStateRef.current = mapAppState(AppState.currentState);
    const sub = AppState.addEventListener("change", (s) => {
      appStateRef.current = mapAppState(s);
    });
    return () => sub.remove();
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

    // ---------------------------------------------------------------
    // Generation loop
    //
    // The worker reads notes/report_data from the local row, calls the
    // generate-report edge function, and writes the result back through
    // the local repo (which enqueues a push). The driver wraps the
    // worker with retry/backoff and durable job state so we can recover
    // across crashes.
    //
    // Mode defaults to 'auto_any'; battery is treated as charging until
    // expo-battery is wired up so it never blocks. Net type comes from
    // NetInfo. Budget is unbounded for now (cost cap is a follow-up).
    // ---------------------------------------------------------------
    const generateFn = makeGenerateFn({
      db,
      backend,
      clock: isoClock,
      newId: randomId,
      getProvider: () => getStoredProvider(),
      getModel: () => getStoredProvider().then((p) => getStoredModel(p)),
    });
    const generationCtx = (): GenerationContext => ({
      mode: "auto_any",
      net: { reachable: isOnlineRef.current, type: netTypeRef.current },
      battery: { level: 1, charging: true },
      appState: appStateRef.current,
      budget: { spentToday: 0, limit: Number.POSITIVE_INFINITY },
      userInitiated: false,
    });
    const worker = new GenerationWorker({
      db,
      generate: generateFn,
      ctx: generationCtx,
    });

    const runGeneration = async () => {
      if (generationInFlight.current || !isOnlineRef.current) return;
      generationInFlight.current = true;
      try {
        // Drain greedily: keep popping while jobs remain and the gates
        // stay green. `runGenerationOnce` is single-flight at the pass
        // level so we do not double-pick if a trigger fires concurrently.
        // Bail early once the driver reports idle to avoid burning cycles.
        for (let i = 0; i < 5; i++) {
          const out = await runGenerationOnce({
            db,
            worker,
            now: isoClock,
          });
          if (out.kind === "idle") break;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[SyncProvider] generation failed", err);
      } finally {
        generationInFlight.current = false;
      }
    };

    triggerGenerationRef.current = (reportId, mode = "auto") => {
      void (async () => {
        try {
          await enqueueJob({
            db,
            reportId,
            mode,
            now: isoClock(),
          });
          await runGeneration();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[SyncProvider] enqueue generation failed", err);
        }
      })();
    };

    const pullId = setInterval(runPull, PULL_INTERVAL_MS);
    const pushId = setInterval(runPush, PUSH_INTERVAL_MS);
    const genId = setInterval(runGeneration, GENERATION_INTERVAL_MS);

    // Initial cycle on mount.
    void runPull();
    void runPush();
    void runGeneration();

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void runPull();
        void runPush();
        void runGeneration();
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    // Trigger an immediate cycle on reconnect.
    const netInfoUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        void runPull();
        void runPush();
        void runGeneration();
      }
    });

    return () => {
      clearInterval(pullId);
      clearInterval(pushId);
      clearInterval(genId);
      sub.remove();
      netInfoUnsub();
      if (notifyTimer) {
        clearTimeout(notifyTimer);
        notifyTimer = null;
        // Drop any pending merged result on unmount; subscribers go
        // away with the provider.
        pendingResults.length = 0;
      }
      triggerPushRef.current = () => {};
      triggerPullRef.current = async () => {};
      triggerGenerationRef.current = () => {};
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

  const triggerGeneration = useCallback(
    (reportId: string, mode: JobMode = "auto") => {
      triggerGenerationRef.current(reportId, mode);
    },
    [],
  );

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
      triggerGeneration,
    }),
    [
      db,
      isReady,
      isOnline,
      onPushComplete,
      onPullComplete,
      triggerPush,
      triggerPull,
      triggerGeneration,
    ],
  );

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

function mapNetType(t: string | null | undefined): NetType {
  if (t === "wifi") return "wifi";
  if (t === "cellular") return "cellular";
  if (t === "none") return "none";
  return "unknown";
}

function mapAppState(
  s: AppStateStatus,
): "active" | "background" | "inactive" {
  if (s === "active") return "active";
  if (s === "background") return "background";
  return "inactive";
}
