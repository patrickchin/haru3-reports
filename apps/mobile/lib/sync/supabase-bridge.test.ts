import { describe, expect, it, vi } from "vitest";

import { makeMutationCaller, makePullFetcher } from "./supabase-bridge";

function makeRpc(impl: (fn: string, args: unknown) => unknown) {
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    const result = impl(fn, args);
    return result as { data: unknown; error: { message: string } | null };
  });
  return { rpc } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("makePullFetcher", () => {
  it("maps projects → pull_projects_since with cursor and limit", async () => {
    const sb = makeRpc((fn, args) => {
      expect(fn).toBe("pull_projects_since");
      expect(args).toEqual({ p_cursor: "2026-01-01", p_limit: 100 });
      return { data: [{ id: "p1", updated_at: "2026", deleted_at: null }], error: null };
    });
    const fetch = makePullFetcher(sb);
    const rows = await fetch("projects", "2026-01-01", 100);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("p1");
  });

  it("maps reports/project_members/file_metadata to their RPCs", async () => {
    const calls: string[] = [];
    const sb = makeRpc((fn) => {
      calls.push(fn);
      return { data: [], error: null };
    });
    const fetch = makePullFetcher(sb);
    await fetch("reports", null, 50);
    await fetch("project_members", null, 50);
    await fetch("file_metadata", null, 50);
    expect(calls).toEqual([
      "pull_reports_since",
      "pull_project_members_since",
      "pull_file_metadata_since",
    ]);
  });

  it("throws for unknown table", async () => {
    const sb = makeRpc(() => ({ data: null, error: null }));
    const fetch = makePullFetcher(sb);
    await expect(fetch("unknown", null, 10)).rejects.toThrow(/no RPC/);
  });

  it("propagates rpc error", async () => {
    const sb = makeRpc(() => ({ data: null, error: { message: "boom" } }));
    const fetch = makePullFetcher(sb);
    await expect(fetch("projects", null, 10)).rejects.toThrow(/boom/);
  });

  it("returns empty array when data is null", async () => {
    const sb = makeRpc(() => ({ data: null, error: null }));
    const fetch = makePullFetcher(sb);
    const rows = await fetch("projects", null, 10);
    expect(rows).toEqual([]);
  });
});

describe("makeMutationCaller", () => {
  const payload = {
    client_op_id: "op-1",
    op: "insert" as const,
    id: "p1",
    base_version: null,
    fields: { name: "x" },
  };

  it("maps project → apply_project_mutation", async () => {
    const sb = makeRpc((fn, args) => {
      expect(fn).toBe("apply_project_mutation");
      expect(args).toEqual({ p_payload: payload });
      return {
        data: { status: "applied", server_version: "v1", row: { id: "p1" } },
        error: null,
      };
    });
    const call = makeMutationCaller(sb);
    const res = await call("project", payload);
    expect(res.status).toBe("applied");
  });

  it("maps report → apply_report_mutation", async () => {
    const sb = makeRpc((fn) => {
      expect(fn).toBe("apply_report_mutation");
      return { data: { status: "applied", server_version: "v1", row: null }, error: null };
    });
    const call = makeMutationCaller(sb);
    await call("report", payload);
  });

  it("throws for entity without apply RPC (file_metadata)", async () => {
    const sb = makeRpc(() => ({ data: null, error: null }));
    const call = makeMutationCaller(sb);
    await expect(call("file_metadata", payload)).rejects.toThrow(/no apply RPC/);
  });

  it("propagates rpc error", async () => {
    const sb = makeRpc(() => ({ data: null, error: { message: "oops" } }));
    const call = makeMutationCaller(sb);
    await expect(call("project", payload)).rejects.toThrow(/oops/);
  });

  it("throws when response has no data", async () => {
    const sb = makeRpc(() => ({ data: null, error: null }));
    const call = makeMutationCaller(sb);
    await expect(call("project", payload)).rejects.toThrow(/empty response/);
  });
});
