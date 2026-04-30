/**
 * RLS integration tests — `public.audit_logs` and `record_audit_event` RPC.
 *
 * Policy (202605010001_audit_logs.sql):
 *   - SELECT: actor_id = auth.uid()  (read own rows only)
 *   - No INSERT/UPDATE/DELETE policies → only callable through the
 *     SECURITY DEFINER `record_audit_event` RPC.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIKE, SARAH, signIn } from "./helpers";

describe("RLS — audit_logs", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
  });

  afterAll(async () => {
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("record_audit_event stamps actor_id from auth.uid()", async () => {
    const { data: id, error } = await mike.rpc("record_audit_event", {
      p_event_type: "test.event",
      p_outcome: "success",
      p_metadata: { foo: "bar" },
    });
    expect(error).toBeNull();
    expect(id).toBeTruthy();

    const { data: row } = await mike
      .from("audit_logs")
      .select("id, actor_id, event_type, outcome, metadata")
      .eq("id", id as string)
      .maybeSingle();

    expect(row).toMatchObject({
      actor_id: MIKE.id,
      event_type: "test.event",
      outcome: "success",
      metadata: { foo: "bar" },
    });
  });

  it("rejects invalid outcome", async () => {
    const { error } = await mike.rpc("record_audit_event", {
      p_event_type: "test.invalid",
      p_outcome: "bogus",
    });
    expect(error).not.toBeNull();
  });

  it("user cannot SELECT other users' audit rows", async () => {
    const { data: id } = await mike.rpc("record_audit_event", {
      p_event_type: "test.private",
    });
    const { data } = await sarah
      .from("audit_logs")
      .select("id")
      .eq("id", id as string)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("direct INSERT is blocked by RLS", async () => {
    const { error } = await mike.from("audit_logs").insert({
      event_type: "spoof",
      actor_id: SARAH.id,
    });
    expect(error).not.toBeNull();
  });

  it("direct UPDATE/DELETE are blocked", async () => {
    const { data: id } = await mike.rpc("record_audit_event", {
      p_event_type: "test.immutable",
    });

    const { error: updateErr } = await mike
      .from("audit_logs")
      .update({ event_type: "tampered" })
      .eq("id", id as string);
    // No update policy → either rejects or matches zero rows.
    if (updateErr === null) {
      const { data } = await mike
        .from("audit_logs")
        .select("event_type")
        .eq("id", id as string)
        .maybeSingle();
      expect(data?.event_type).toBe("test.immutable");
    }

    const { error: delErr } = await mike
      .from("audit_logs")
      .delete()
      .eq("id", id as string);
    if (delErr === null) {
      const { data } = await mike
        .from("audit_logs")
        .select("id")
        .eq("id", id as string)
        .maybeSingle();
      expect(data?.id).toBe(id);
    }
  });
});
