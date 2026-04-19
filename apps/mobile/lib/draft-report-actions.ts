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
    delete: () => {
      eq: (column: "id", value: string) => {
        eq: (column: "project_id", value: string) => PromiseLike<DeleteResult>;
      };
    };
  };
};

type DeleteDraftReportParams = {
  backend: BackendLike;
  reportId: string;
  projectId: string;
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

export async function deleteDraftReport({
  backend,
  reportId,
  projectId,
}: DeleteDraftReportParams): Promise<void> {
  const result = await backend
    .from("reports")
    .delete()
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
