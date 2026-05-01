import { describe, expect, it, vi } from "vitest";
import {
  deleteDraftReport,
  type BackendLike,
} from "./draft-report-actions";

describe("deleteDraftReport", () => {
  it("soft-deletes the draft for the matching project", async () => {
    const eqProjectId = vi.fn().mockResolvedValue({ error: null });
    const eqReportId = vi.fn(() => ({ eq: eqProjectId }));
    const update = vi.fn(() => ({ eq: eqReportId }));
    const from = vi.fn(() => ({ update }));
    const backend = { from } satisfies BackendLike;

    await deleteDraftReport({
      backend,
      reportId: "report-123",
      projectId: "project-456",
    });

    expect(from).toHaveBeenCalledWith("reports");
    expect(update).toHaveBeenCalledTimes(1);
    const patch = update.mock.calls[0][0] as { deleted_at: string };
    expect(typeof patch.deleted_at).toBe("string");
    expect(Number.isNaN(Date.parse(patch.deleted_at))).toBe(false);
    expect(eqReportId).toHaveBeenCalledWith("id", "report-123");
    expect(eqProjectId).toHaveBeenCalledWith("project_id", "project-456");
  });

  it("throws the backend error when the soft-delete fails", async () => {
    const error = new Error("permission denied");
    const eqProjectId = vi.fn().mockResolvedValue({ error });
    const eqReportId = vi.fn(() => ({ eq: eqProjectId }));
    const update = vi.fn(() => ({ eq: eqReportId }));
    const from = vi.fn(() => ({ update }));
    const backend = { from } satisfies BackendLike;

    await expect(
      deleteDraftReport({
        backend,
        reportId: "report-123",
        projectId: "project-456",
      }),
    ).rejects.toThrow("permission denied");
  });
});
