import { describe, expect, it, vi } from "vitest";
import { recordAuditEvent } from "@/lib/audit-log";

describe("recordAuditEvent", () => {
  it("calls record_audit_event RPC with scrubbed metadata", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "id", error: null });
    await recordAuditEvent(
      {
        event_type: "auth.login",
        outcome: "success",
        metadata: { token: "secret", phone: "+15551234567" },
      },
      { rpc } as any,
    );
    expect(rpc).toHaveBeenCalledWith("record_audit_event", {
      p_event_type: "auth.login",
      p_outcome: "success",
      p_resource: null,
      p_resource_id: null,
      p_metadata: expect.objectContaining({
        token: "[redacted]",
        // phone field key is not sensitive but the value contains a phone
        // pattern → scrubbed via scrubString
        phone: "[phone]",
      }),
    });
  });

  it("swallows RPC errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "x" } });
    await expect(
      recordAuditEvent({ event_type: "auth.login" }, { rpc } as any),
    ).resolves.toBeUndefined();
  });

  it("swallows thrown exceptions", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      recordAuditEvent({ event_type: "auth.login" }, { rpc } as any),
    ).resolves.toBeUndefined();
  });

  it("defaults outcome to success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "id", error: null });
    await recordAuditEvent({ event_type: "x" }, { rpc } as any);
    expect(rpc.mock.calls[0]![1].p_outcome).toBe("success");
  });
});
