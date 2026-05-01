type DeleteResult = {
  error: Error | { message: string } | null;
};

export type BackendLike = {
  from: (table: "reports") => {
    update: (patch: { deleted_at: string }) => {
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

export async function deleteDraftReport({
  backend,
  reportId,
  projectId,
}: DeleteDraftReportParams): Promise<void> {
  // Soft-delete: set deleted_at. RLS SELECT policy hides deleted_at IS NOT NULL
  // rows, so the UI behaves as if the row is gone, but the audit trail is
  // preserved and the local-first sync can mirror the tombstone.
  const result = await backend
    .from("reports")
    .update({ deleted_at: new Date().toISOString() })
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
