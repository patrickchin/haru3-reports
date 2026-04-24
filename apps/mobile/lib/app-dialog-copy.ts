export type AppDialogActionVariant = "default" | "secondary" | "destructive" | "quiet";

export interface AppDialogCopy {
  title: string;
  message: string;
  tone: "danger";
  noticeTitle: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant: AppDialogActionVariant;
}

export function getDeleteDraftDialogCopy(): AppDialogCopy {
  return {
    title: "Delete Draft",
    message: "This draft report will be removed. This cannot be undone.",
    tone: "danger",
    noticeTitle: "Permanent action",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    confirmVariant: "destructive",
  };
}

export function getDeleteProjectDialogCopy(): AppDialogCopy {
  return {
    title: "Delete Project",
    message: "This project and all its reports will be permanently deleted. This cannot be undone.",
    tone: "danger",
    noticeTitle: "Permanent action",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    confirmVariant: "destructive",
  };
}

export function getDeleteReportDialogCopy(): AppDialogCopy {
  return {
    title: "Delete Report",
    message: "This report will be permanently deleted. This cannot be undone.",
    tone: "danger",
    noticeTitle: "Permanent action",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    confirmVariant: "destructive",
  };
}

export function getRemoveMemberDialogCopy(name: string): AppDialogCopy {
  return {
    title: "Remove Member",
    message: `${name} will be removed from this project and will lose access to its reports.`,
    tone: "danger",
    noticeTitle: "This cannot be undone",
    confirmLabel: "Remove",
    cancelLabel: "Cancel",
    confirmVariant: "destructive",
  };
}

export function getActionErrorDialogCopy({
  title,
  fallbackMessage,
  message,
}: {
  title: string;
  fallbackMessage: string;
  message?: string;
}): AppDialogCopy {
  return {
    title,
    message: message?.trim() || fallbackMessage,
    tone: "danger",
    noticeTitle: "Action failed",
    confirmLabel: "Done",
    confirmVariant: "secondary",
  };
}
