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

  it("wraps non-Error backend failures in an Error using their message", async () => {
    // PostgREST and supabase-js sometimes surface plain `{ message }`
    // objects rather than real Error instances; we wrap those so callers
    // always see a real Error with a stack.
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: { message: "row not found" } });
    const backend = { rpc } satisfies BackendLike;

    await expect(
      deleteDraftReport({
        backend,
        reportId: "report-123",
        projectId: "project-456",
      }),
    ).rejects.toThrow("row not found");
  });
});
