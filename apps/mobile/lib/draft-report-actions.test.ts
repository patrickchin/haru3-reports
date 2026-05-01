import { describe, expect, it, vi } from "vitest";
import {
  deleteDraftReport,
  type BackendLike,
} from "./draft-report-actions";

describe("deleteDraftReport", () => {
  it("soft-deletes the draft via the soft_delete_report RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const backend = { rpc } satisfies BackendLike;

    await deleteDraftReport({
      backend,
      reportId: "report-123",
      projectId: "project-456",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("soft_delete_report", {
      p_id: "report-123",
    });
  });

  it("throws the backend error when the RPC fails", async () => {
    const error = new Error("permission denied");
    const rpc = vi.fn().mockResolvedValue({ error });
    const backend = { rpc } satisfies BackendLike;

    await expect(
      deleteDraftReport({
        backend,
        reportId: "report-123",
        projectId: "project-456",
      }),
    ).rejects.toThrow("permission denied");
  });
});
