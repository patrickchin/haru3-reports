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
  getDeleteReportDialogCopy,
} from "@/lib/app-dialog-copy";

export interface ReportDialogSheetState extends AppDialogCopy {
  kind: "error" | "confirm-delete";
}

interface UseReportDeleteArgs {
  projectId: string;
  reportId: string;
}

export function useReportDelete({ projectId, reportId }: UseReportDeleteArgs) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { remove: removeReport } = useLocalReportMutations();
  const isDeleting = removeReport.isPending;
  const [reportDialogSheet, setReportDialogSheet] =
    useState<ReportDialogSheetState | null>(null);

  const deleteReport = () =>
    removeReport.mutate(
      { id: reportId, projectId },
      {
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
          setReportDialogSheet({
            kind: "error",
            ...getActionErrorDialogCopy({
              title: "Delete Failed",
              fallbackMessage: "Could not delete the report.",
              message:
                err instanceof Error ? err.message : "Could not delete the report.",
            }),
          });
        },
      },
    );

  const confirmDelete = () => {
    setReportDialogSheet({
      kind: "confirm-delete",
      ...getDeleteReportDialogCopy(),
    });
  };

  const closeReportDialogSheet = () => {
    if (isDeleting && reportDialogSheet?.kind === "confirm-delete") {
      return;
    }
    setReportDialogSheet(null);
  };

  const canDismissReportDialogSheet =
    reportDialogSheet?.kind !== "confirm-delete" || !isDeleting;

  return {
    isDeleting,
    reportDialogSheet,
    setReportDialogSheet,
    deleteReport,
    confirmDelete,
    closeReportDialogSheet,
    canDismissReportDialogSheet,
  };
}
