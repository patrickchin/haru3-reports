import { useState } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  reportKey,
  reportsKey,
  useLocalReportMutations,
} from "@/hooks/useLocalReports";
import {
  type AppDialogCopy,
  getActionErrorDialogCopy,
  getUnfinalizeReportDialogCopy,
} from "@/lib/app-dialog-copy";

export interface ReportUnfinalizeDialogSheetState extends AppDialogCopy {
  kind: "error" | "confirm-unfinalize";
}

interface UseReportUnfinalizeArgs {
  projectId: string;
  reportId: string;
}

export function useReportUnfinalize({
  projectId,
  reportId,
}: UseReportUnfinalizeArgs) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { update } = useLocalReportMutations();
  const isUnfinalizing = update.isPending;
  const [unfinalizeDialogSheet, setUnfinalizeDialogSheet] =
    useState<ReportUnfinalizeDialogSheetState | null>(null);

  const unfinalizeReport = () =>
    update.mutate(
      {
        id: reportId,
        projectId,
        fields: { status: "draft" },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: reportKey(reportId) });
          queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
          setUnfinalizeDialogSheet(null);
          const editorHref =
            `/projects/${projectId}/reports/generate?reportId=${reportId}`;
          if (router.canDismiss()) {
            router.dismissTo(editorHref);
            return;
          }
          router.replace(editorHref);
        },
        onError: (err) => {
          setUnfinalizeDialogSheet({
            kind: "error",
            ...getActionErrorDialogCopy({
              title: "Unfinalize Failed",
              fallbackMessage: "Could not move the report back to draft.",
              message:
                err instanceof Error
                  ? err.message
                  : "Could not move the report back to draft.",
            }),
          });
        },
      },
    );

  const confirmUnfinalize = () => {
    setUnfinalizeDialogSheet({
      kind: "confirm-unfinalize",
      ...getUnfinalizeReportDialogCopy(),
    });
  };

  const closeUnfinalizeDialogSheet = () => {
    if (
      isUnfinalizing &&
      unfinalizeDialogSheet?.kind === "confirm-unfinalize"
    ) {
      return;
    }
    setUnfinalizeDialogSheet(null);
  };

  const canDismissUnfinalizeDialogSheet =
    unfinalizeDialogSheet?.kind !== "confirm-unfinalize" || !isUnfinalizing;

  return {
    isUnfinalizing,
    unfinalizeDialogSheet,
    setUnfinalizeDialogSheet,
    unfinalizeReport,
    confirmUnfinalize,
    closeUnfinalizeDialogSheet,
    canDismissUnfinalizeDialogSheet,
  };
}
