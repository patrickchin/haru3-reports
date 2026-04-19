export type DraftConfirmationButton = {
  text: string;
  style?: "cancel" | "destructive";
  onPress?: () => void;
};

export type DraftDeleteConfirmation = {
  title: string;
  message: string;
  buttons: DraftConfirmationButton[];
};

type DeleteResult = {
  error: Error | { message: string } | null;
};

export type BackendLike = {
  from: (table: "reports") => {
    update: (values: { deleted_at: string }) => {
      eq: (column: "id", value: string) => {
        eq: (column: "project_id", value: string) => PromiseLike<DeleteResult>;
      };
    };
  };
};

type SoftDeleteDraftReportParams = {
  backend: BackendLike;
  reportId: string;
  projectId: string;
  deletedAt?: string;
};

export function buildDeleteDraftConfirmation(
  onConfirmDelete: () => void,
): DraftDeleteConfirmation {
  return {
    title: "Delete Draft",
    message: "This draft report will be removed. This cannot be undone.",
    buttons: [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirmDelete },
    ],
  };
}

export async function softDeleteDraftReport({
  backend,
  reportId,
  projectId,
  deletedAt = new Date().toISOString(),
}: SoftDeleteDraftReportParams): Promise<void> {
  const result = await backend
    .from("reports")
    .update({ deleted_at: deletedAt })
    .eq("id", reportId)
    .eq("project_id", projectId);

  if (!result.error) {
    return;
  }

  if (result.error instanceof Error) {
    throw result.error;
  }

  throw new Error(result.error.message);
}
