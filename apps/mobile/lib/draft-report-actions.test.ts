import { describe, expect, it, vi } from "vitest";
import {
  buildDeleteDraftConfirmation,
  softDeleteDraftReport,
  type BackendLike,
} from "./draft-report-actions";

describe("buildDeleteDraftConfirmation", () => {
  it("returns destructive confirmation copy and forwards the confirm callback", () => {
    const onConfirmDelete = vi.fn();

    const confirmation = buildDeleteDraftConfirmation(onConfirmDelete);

    expect(confirmation.title).toBe("Delete Draft");
    expect(confirmation.message).toBe(
      "This draft report will be removed. This cannot be undone.",
    );
    expect(confirmation.buttons).toHaveLength(2);
    expect(confirmation.buttons[0]).toMatchObject({
      text: "Cancel",
      style: "cancel",
    });
    expect(confirmation.buttons[1]).toMatchObject({
      text: "Delete",
      style: "destructive",
    });

    confirmation.buttons[1]?.onPress?.();

    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });
});

describe("softDeleteDraftReport", () => {
  it("marks the draft as deleted for the matching project", async () => {
    const eqProjectId = vi.fn().mockResolvedValue({ error: null });
    const eqReportId = vi.fn(() => ({ eq: eqProjectId }));
    const update = vi.fn(() => ({ eq: eqReportId }));
    const from = vi.fn(() => ({ update }));
    const backend = { from } satisfies BackendLike;

    await softDeleteDraftReport({
      backend,
      reportId: "report-123",
      projectId: "project-456",
      deletedAt: "2026-04-20T10:30:00.000Z",
    });

    expect(from).toHaveBeenCalledWith("reports");
    expect(update).toHaveBeenCalledWith({
      deleted_at: "2026-04-20T10:30:00.000Z",
    });
    expect(eqReportId).toHaveBeenCalledWith("id", "report-123");
    expect(eqProjectId).toHaveBeenCalledWith("project_id", "project-456");
  });

  it("throws the backend error when the delete fails", async () => {
    const error = new Error("permission denied");
    const eqProjectId = vi.fn().mockResolvedValue({ error });
    const eqReportId = vi.fn(() => ({ eq: eqProjectId }));
    const update = vi.fn(() => ({ eq: eqReportId }));
    const from = vi.fn(() => ({ update }));
    const backend = { from } satisfies BackendLike;

    await expect(
      softDeleteDraftReport({
        backend,
        reportId: "report-123",
        projectId: "project-456",
        deletedAt: "2026-04-20T10:30:00.000Z",
      }),
    ).rejects.toThrow("permission denied");
  });
});
