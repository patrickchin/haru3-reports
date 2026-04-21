export type ReportActionFailureType = "delete" | "save" | "export";

interface ReportDialogCopy {
  title: string;
  message: string;
  tone: "danger";
  confirmLabel: string;
  cancelLabel?: string;
}

const reportActionFailureTitles: Record<ReportActionFailureType, string> = {
  delete: "Delete Failed",
  save: "Save Failed",
  export: "Export Failed",
};

const reportActionFailureMessages: Record<ReportActionFailureType, string> = {
  delete: "Could not delete the report.",
  save: "Could not generate PDF.",
  export: "Could not generate PDF.",
};

export function getDeleteReportDialogCopy(): ReportDialogCopy {
  return {
    title: "Delete Report",
    message: "This report will be permanently deleted. This cannot be undone.",
    tone: "danger",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  };
}

export function getReportActionErrorDialogCopy(
  action: ReportActionFailureType,
  message?: string
): ReportDialogCopy {
  return {
    title: reportActionFailureTitles[action],
    message: message?.trim() || reportActionFailureMessages[action],
    tone: "danger",
    confirmLabel: "Done",
  };
}
