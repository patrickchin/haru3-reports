type DeleteResult = {
  error: Error | { message: string } | null;
};

export type BackendLike = {
  rpc: (
    fn: "soft_delete_report",
    args: { p_id: string },
  ) => PromiseLike<DeleteResult>;
};

type DeleteDraftReportParams = {
  backend: BackendLike;
  reportId: string;
  /**
   * Retained for log/UI context — soft-delete authorisation is enforced
   * server-side by the SECURITY DEFINER RPC against `reports.owner_id`.
   */
  projectId: string;
};

export async function deleteDraftReport({
  backend,
  reportId,
}: DeleteDraftReportParams): Promise<void> {
  // Soft-delete via SECURITY DEFINER RPC. A direct
  //   update({ deleted_at }).eq('id', reportId)
  // fails RLS (42501) because the post-update row no longer satisfies
  // the SELECT policy `deleted_at IS NULL`. The RPC enforces
  // owner-only deletion server-side and matches the local-first
  // apply_report_mutation contract.
  const result = await backend.rpc("soft_delete_report", { p_id: reportId });

  if (!result.error) {
    return;
  }

  if (result.error instanceof Error) {
    throw result.error;
  }

  throw new Error(result.error.message);
}
