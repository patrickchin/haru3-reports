/**
 * RLS integration tests — soft-delete SECURITY DEFINER RPCs.
 *
 * Why this file exists
 * --------------------
 * The "soft-delete via direct UPDATE" pattern (`update({ deleted_at })`)
 * fails RLS (42501) on every table whose SELECT policy filters
 * `deleted_at IS NULL`, because PostgreSQL applies the SELECT policy
 * USING expression to the post-update row. The cloud-fallback paths in
 * the mobile app therefore route through SECURITY DEFINER soft-delete
 * RPCs added in `202605020001_soft_delete_rpcs.sql`.
 *
 * Coverage:
 *   1. Direct client UPDATE of `deleted_at` is rejected — pins the
 *      Postgres behaviour so a future migration relaxing the SELECT
 *      policy doesn't silently re-enable a regression.
 *   2. The matching SECURITY DEFINER RPC is granted to authenticated,
 *      enforces ownership / role checks, and tombstones the row.
 *   3. Strangers cannot soft-delete via the RPC.
 *   4. After the RPC, the row is invisible to SELECT (filtered by
 *      `deleted_at IS NULL` in the SELECT policy).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIKE,
  SARAH,
  signIn,
  cleanupProjects,
  cleanupFileMetadata,
} from "./helpers";

describe("RLS — soft-delete RPCs", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  const createdProjects: string[] = [];
  const createdFiles: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
  });

  afterAll(async () => {
    // Best-effort cleanup. Soft-deleted rows are invisible to RLS DELETE
    // (USING `auth.uid() = owner_id` works regardless of deleted_at, but
    // the matching SELECT to find them in `.in()` doesn't), so we ignore
    // errors here — the seeded DB is reset between full local runs.
    await cleanupFileMetadata(mike, createdFiles).catch(() => {});
    await cleanupProjects(mike, createdProjects).catch(() => {});
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  // ============================================================
  // projects
  // ============================================================
  describe("projects", () => {
    it("rejects direct client UPDATE of deleted_at (regression for the bug fixed by the RPC)", async () => {
      const id = await insertProject(mike, MIKE.id, "rls-direct-update");
      createdProjects.push(id);

      const { error } = await mike
        .from("projects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);

      // Postgres surfaces this as 42501 — the post-update row would no
      // longer satisfy the SELECT policy `deleted_at IS NULL`. If this
      // assertion ever flips to `error === null`, the SELECT policy or
      // RLS semantics changed and the cloud-fallback paths can be
      // simplified back to a direct UPDATE.
      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
    });

    it("owner can soft-delete via RPC; row becomes invisible", async () => {
      const id = await insertProject(mike, MIKE.id, "rls-rpc-owner");
      createdProjects.push(id);

      const { error } = await mike.rpc("soft_delete_project", { p_id: id });
      expect(error).toBeNull();

      const { data } = await mike
        .from("projects")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("stranger cannot soft-delete another user's project", async () => {
      const id = await insertProject(mike, MIKE.id, "rls-rpc-stranger");
      createdProjects.push(id);

      const { error } = await sarah.rpc("soft_delete_project", { p_id: id });
      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");

      // Project still alive for Mike.
      const { data } = await mike
        .from("projects")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      expect(data?.id).toBe(id);
    });

    it("RPC is idempotent on already-soft-deleted / non-existent ids", async () => {
      const { error: e1 } = await mike.rpc("soft_delete_project", {
        p_id: "00000000-0000-0000-0000-000000000000",
      });
      expect(e1).toBeNull();
    });
  });

  // ============================================================
  // reports
  // ============================================================
  describe("reports", () => {
    it("rejects direct client UPDATE of deleted_at", async () => {
      const projectId = await insertProject(mike, MIKE.id, "rls-rpt-direct");
      createdProjects.push(projectId);
      const reportId = await insertReport(mike, MIKE.id, projectId);

      const { error } = await mike
        .from("reports")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", reportId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
    });

    it("owner can soft-delete a report via RPC", async () => {
      const projectId = await insertProject(mike, MIKE.id, "rls-rpt-rpc");
      createdProjects.push(projectId);
      const reportId = await insertReport(mike, MIKE.id, projectId);

      const { error } = await mike.rpc("soft_delete_report", {
        p_id: reportId,
      });
      expect(error).toBeNull();

      const { data } = await mike
        .from("reports")
        .select("id")
        .eq("id", reportId)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("stranger cannot soft-delete another user's report", async () => {
      const projectId = await insertProject(mike, MIKE.id, "rls-rpt-stranger");
      createdProjects.push(projectId);
      const reportId = await insertReport(mike, MIKE.id, projectId);

      const { error } = await sarah.rpc("soft_delete_report", {
        p_id: reportId,
      });
      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
    });
  });
});

// --------------------------------------------------------------
// helpers
// --------------------------------------------------------------
async function insertProject(
  client: SupabaseClient,
  ownerId: string,
  name: string,
): Promise<string> {
  const { data, error } = await client
    .from("projects")
    .insert({ name, owner_id: ownerId })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function insertReport(
  client: SupabaseClient,
  ownerId: string,
  projectId: string,
): Promise<string> {
  const { data, error } = await client
    .from("reports")
    .insert({
      title: "soft-delete RLS test",
      report_type: "daily",
      project_id: projectId,
      owner_id: ownerId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}
