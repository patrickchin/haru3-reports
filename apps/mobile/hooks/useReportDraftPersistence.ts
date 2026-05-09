import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  reportKey,
  reportsKey,
  useLocalReport,
  useLocalReportMutations,
} from "@/hooks/useLocalReports";
import { useReportAutoSave } from "@/hooks/useReportAutoSave";
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@/lib/generated-report";
import { getReportCompleteness } from "@/lib/report-helpers";
import type { LastGeneration } from "@/hooks/useReportGeneration";

interface UseReportDraftPersistenceArgs {
  projectId: string;
  reportId: string | undefined;
  report: GeneratedSiteReport | null;
  setReport: React.Dispatch<React.SetStateAction<GeneratedSiteReport | null>>;
  lastGeneration: LastGeneration | null;
  setLastGeneration: React.Dispatch<React.SetStateAction<LastGeneration | null>>;
}

export function useReportDraftPersistence({
  projectId,
  reportId,
  report,
  setReport,
  lastGeneration,
  setLastGeneration,
}: UseReportDraftPersistenceArgs) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedRef = useRef("");
  const reportRef = useRef(report);
  reportRef.current = report;

  const { update: localUpdate, remove: localRemove } = useLocalReportMutations();
  const { data: draftData } = useLocalReport(reportId ?? null);
  const draftSeededRef = useRef(false);

  const [draftDeleteErrorMessage, setDraftDeleteErrorMessage] = useState<string | null>(null);
  const [isFinalizeConfirmVisible, setIsFinalizeConfirmVisible] = useState(false);

  const completeness = report ? getReportCompleteness(report) : 0;

  const doSave = useCallback(async () => {
    if (!reportId) return;
    const currentReport = reportRef.current;
    const key = JSON.stringify({ report: currentReport });
    if (key === lastSavedRef.current) return;

    // Notes are persisted directly to `report_notes` via
    // `useReportNotesMutations`; this save path only writes the generated
    // report payload + meta + last_generation snapshot back to the
    // `reports` row.
    const fields: Record<string, unknown> = {
      report_data: currentReport ?? {},
      confidence: currentReport ? getReportCompleteness(currentReport) : 0,
    };
    if (currentReport) {
      fields.title = currentReport.report.meta.title;
      fields.report_type = currentReport.report.meta.reportType;
      fields.visit_date = currentReport.report.meta.visitDate ?? null;
    }
    if (lastGeneration) {
      fields.last_generation = lastGeneration as unknown as Record<string, unknown>;
    }
    try {
      await localUpdate.mutateAsync({
        id: reportId,
        projectId,
        fields: fields as Parameters<typeof localUpdate.mutateAsync>[0]["fields"],
      });
      lastSavedRef.current = key;
    } catch {
      // swallow — debounced save retries on next change
    }
  }, [reportId, projectId, localUpdate, lastGeneration]);

  // Hydrate local state from the persisted draft once it loads. Subsequent
  // refetches (e.g. after a sync pull) are ignored so we never clobber the
  // user's in-progress edits — `doSave` is the single writer from here on.
  useEffect(() => {
    if (!reportId || draftSeededRef.current || !draftData) return;
    draftSeededRef.current = true;
    const rd = draftData.report_data;
    if (rd && typeof rd === "object" && Object.keys(rd).length > 0) {
      const parsed = normalizeGeneratedReportPayload(rd);
      if (parsed) {
        setReport(parsed);
        lastSavedRef.current = JSON.stringify({
          report: parsed,
        });
      }
    }
    // Hydrate the Debug tab's lastGeneration from the persisted column.
    const persistedLg = draftData.last_generation;
    if (persistedLg && typeof persistedLg === "object") {
      setLastGeneration(persistedLg as unknown as LastGeneration | null);
    }
  }, [reportId, draftData, setReport, setLastGeneration]);

  // Auto-save with debounce
  useEffect(() => {
    if (!reportId) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(doSave, 2000);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [report, reportId, doSave]);

  // Form-driven autosave indicator. Writes are idempotent w.r.t. `doSave`
  // (both go through useLocalReportMutations.update with the same
  // `report_data` payload), so the hook just exposes `isSaving` /
  // `lastSavedAt` for the Edit tab header. Disabled until reportId exists.
  const { isSaving: isAutoSaving, lastSavedAt } = useReportAutoSave({
    reportId: reportId ?? null,
    projectId: projectId ?? "",
    report: reportId ? report : null,
  });

  // Flush save on app background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        doSave();
      }
    });
    return () => sub.remove();
  }, [doSave]);

  const handleBack = useCallback(async () => {
    clearTimeout(saveTimeoutRef.current);
    await doSave();
    queryClient.invalidateQueries({ queryKey: ["reports", projectId] });
    router.back();
  }, [doSave, projectId, queryClient, router]);

  const { mutate: finalizeReport, isPending: isFinalizing, error: finalizeError } = useMutation({
    mutationFn: async () => {
      if (!report || !reportId) throw new Error("No report to finalize.");
      clearTimeout(saveTimeoutRef.current);
      await localUpdate.mutateAsync({
        id: reportId,
        projectId,
        fields: {
          title: report.report.meta.title,
          report_type: report.report.meta.reportType,
          visit_date: report.report.meta.visitDate ?? null,
          report_data: report,
          confidence: completeness,
          status: "final",
        } as Parameters<typeof localUpdate.mutateAsync>[0]["fields"],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
      setIsFinalizeConfirmVisible(false);
      router.replace(`/projects/${projectId}/reports/${reportId}`);
    },
  });

  const { mutate: deleteDraft, isPending: isDeletingDraft } = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error("No draft report to delete.");
      clearTimeout(saveTimeoutRef.current);
      await localRemove.mutateAsync({ id: reportId, projectId });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: reportKey(reportId) });
      queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
      const reportsHref = `/projects/${projectId}/reports`;

      if (router.canDismiss()) {
        router.dismissTo(reportsHref);
        return;
      }

      router.replace(reportsHref);
    },
    onError: (err) => {
      setDraftDeleteErrorMessage(
        err instanceof Error ? err.message : "Could not delete the draft report.",
      );
    },
  });

  return {
    draftData,
    completeness,
    handleBack,
    // Autosave indicator
    isAutoSaving,
    lastSavedAt,
    // Finalize
    finalizeReport,
    isFinalizing,
    finalizeError,
    isFinalizeConfirmVisible,
    setIsFinalizeConfirmVisible,
    // Delete
    deleteDraft,
    isDeletingDraft,
    draftDeleteErrorMessage,
    setDraftDeleteErrorMessage,
  } as const;
}
