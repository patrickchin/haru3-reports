import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import type { GeneratedSiteReport } from "@/lib/generated-report";

import { useLocalReportMutations } from "./useLocalReports";

export interface UseReportAutoSaveArgs {
  /** When null, the hook is disabled (no writes, no debounce timers fire). */
  reportId: string | null;
  projectId: string;
  /** Latest in-memory snapshot. The hook diffs this against the last persisted one. */
  report: GeneratedSiteReport | null;
  /** Debounce window for writes. Default 1500ms. */
  debounceMs?: number;
}

export interface UseReportAutoSaveResult {
  /** Cancel any pending debounce and immediately persist the latest pending edit. */
  flush: () => Promise<void>;
  /**
   * Prime the persisted-snapshot cache without writing. Use after hydrating
   * from the local DB so the first debounce tick doesn't re-write the
   * just-loaded data.
   */
  markSaved: (snapshot: GeneratedSiteReport) => void;
  isSaving: boolean;
  lastSavedAt: number | null;
}

/**
 * Debounced autosave for the saved-report detail screen.
 *
 * - Holds a JSON snapshot of the last-persisted report and skips writes when
 *   the incoming `report` is structurally identical (cheap deep-compare).
 * - Debounces 1500ms by default; rapid edits collapse into one write.
 * - Flushes on AppState transition away from "active" (background / inactive)
 *   so a user backgrounding the app can't lose trailing edits.
 * - `flush()` is awaitable so the caller can sequence Edit→Done correctly.
 * - `reportId === null` disables the hook entirely.
 */
export function useReportAutoSave({
  reportId,
  projectId,
  report,
  debounceMs = 1500,
}: UseReportAutoSaveArgs): UseReportAutoSaveResult {
  const { update } = useLocalReportMutations();

  // Stable refs to side-step stale-closure bugs across debounce/AppState/unmount.
  const persistedJsonRef = useRef<string | null>(null);
  const pendingRef = useRef<GeneratedSiteReport | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const reportIdRef = useRef<string | null>(reportId);
  const projectIdRef = useRef<string>(projectId);
  const mutateAsyncRef = useRef(update.mutateAsync);

  reportIdRef.current = reportId;
  projectIdRef.current = projectId;
  mutateAsyncRef.current = update.mutateAsync;

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const writeNow = useCallback(async () => {
    const id = reportIdRef.current;
    const snap = pendingRef.current;
    if (!id || !snap) return;
    const json = JSON.stringify(snap);
    if (json === persistedJsonRef.current) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = null;
    let p!: Promise<void>;
    p = (async () => {
      try {
        await mutateAsyncRef.current({
          id,
          projectId: projectIdRef.current,
          fields: {
            report_data: snap as unknown as Record<string, unknown>,
          },
        });
        persistedJsonRef.current = json;
        setLastSavedAt(Date.now());
      } finally {
        if (inflightRef.current === p) inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    await p;
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      await writeNow();
      return;
    }
    if (inflightRef.current) {
      await inflightRef.current;
    }
  }, [writeNow]);

  const markSaved = useCallback((snapshot: GeneratedSiteReport) => {
    persistedJsonRef.current = JSON.stringify(snapshot);
  }, []);

  // Schedule a debounced write whenever `report` differs from the persisted
  // snapshot. `reportId === null` disables.
  useEffect(() => {
    if (!reportId || !report) return;
    const json = JSON.stringify(report);
    if (json === persistedJsonRef.current) return;
    pendingRef.current = report;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void writeNow();
    }, debounceMs);
  }, [report, reportId, debounceMs, writeNow]);

  // Flush on AppState transition out of "active".
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void flush();
      }
    });
    return () => {
      sub.remove();
    };
  }, [flush]);

  // Cancel pending timer on unmount. We deliberately do NOT auto-flush on
  // unmount — the screen calls `flush()` explicitly via Edit/Done; relying on
  // an unmount effect would race with React 19 strict-mode double-mount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return {
    flush,
    markSaved,
    isSaving: update.isPending,
    lastSavedAt,
  };
}
