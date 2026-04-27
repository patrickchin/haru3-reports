/**
 * RLS integration tests for the local-first pull_*_since RPCs.
 *
 * These RPCs run as `SECURITY INVOKER`, so the calling user's RLS still
 * applies via the explicit owner_id / project_members joins inside each
 * function body. We verify:
 *  - cursor semantics (null → all; ts → only newer rows)
 *  - tombstone visibility (soft-deleted rows ARE returned so clients can
 *    reflect remote deletes)
 *  - cross-user isolation (Sarah sees nothing of Mike's projects until
 *    she is added as a member)
 *  - LIMIT clamping (1..1000)
 */
import { afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MIKE,
  SARAH,
  cleanupProjects,
  createOwnedProject,
  signIn,
} from "./helpers";

const createdProjects: string[] = [];

afterAll(async () => {
  if (createdProjects.length === 0) return;
  const mike = await signIn(MIKE);
  await cleanupProjects(mike, createdProjects);
});

async function freshProject(client: SupabaseClient, ownerId: string) {
  const id = await createOwnedProject(client, ownerId);
  createdProjects.push(id);
  return id;
}

describe("pull_projects_since", () => {
  it("returns all owned projects when cursor is null", async () => {
    const mike = await signIn(MIKE);
    const id = await freshProject(mike, MIKE.id);

    const { data, error } = await mike.rpc("pull_projects_since", {
      p_cursor: null,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    expect(data?.some((row: { id: string }) => row.id === id)).toBe(true);
    // Owner-scoped: every returned row is Mike's.
    for (const row of data as Array<{ owner_id: string }>) {
      expect(row.owner_id).toBe(MIKE.id);
    }
  });

  it("returns only rows updated after the cursor", async () => {
    const mike = await signIn(MIKE);
    const id = await freshProject(mike, MIKE.id);
    // Capture this row's updated_at and use it as the cursor.
    const { data: row1 } = await mike
      .from("projects")
      .select("updated_at")
      .eq("id", id)
      .single();

    const { data, error } = await mike.rpc("pull_projects_since", {
      p_cursor: row1!.updated_at,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    // Cursor row must NOT come back.
    expect(data?.some((r: { id: string }) => r.id === id)).toBe(false);
  });

  it("returns soft-deleted rows so clients can mirror tombstones", async () => {
    const mike = await signIn(MIKE);
    const id = await freshProject(mike, MIKE.id);

    // Soft-delete via the apply RPC (the proper local-first path).
    const del = await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: crypto.randomUUID(),
        op: "delete",
        id,
      },
    });
    expect(del.error).toBeNull();
    expect(del.data.status).toBe("applied");

    const { data, error } = await mike.rpc("pull_projects_since", {
      p_cursor: null,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    const tomb = (data as Array<{ id: string; deleted_at: string | null }>).find(
      (r) => r.id === id,
    );
    expect(tomb).toBeDefined();
    expect(tomb!.deleted_at).not.toBeNull();
  });

  it("isolates users — Sarah sees none of Mike's projects", async () => {
    const mike = await signIn(MIKE);
    const id = await freshProject(mike, MIKE.id);

    const sarah = await signIn(SARAH);
    const { data, error } = await sarah.rpc("pull_projects_since", {
      p_cursor: null,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    expect(data?.some((r: { id: string }) => r.id === id)).toBe(false);
    for (const row of data as Array<{ owner_id: string }>) {
      expect(row.owner_id).toBe(SARAH.id);
    }
  });

  it("clamps p_limit to at least 1", async () => {
    const mike = await signIn(MIKE);
    await freshProject(mike, MIKE.id);
    const { data, error } = await mike.rpc("pull_projects_since", {
      p_cursor: null,
      p_limit: 0,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("pull_reports_since", () => {
  it("returns reports for projects where caller is owner or member", async () => {
    const mike = await signIn(MIKE);
    const projectId = await freshProject(mike, MIKE.id);
    const { data: report } = await mike
      .from("reports")
      .insert({
        project_id: projectId,
        owner_id: MIKE.id,
        title: "T",
        report_type: "daily",
      })
      .select("id")
      .single();

    const { data, error } = await mike.rpc("pull_reports_since", {
      p_cursor: null,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    expect(data?.some((r: { id: string }) => r.id === report!.id)).toBe(true);
  });

  it("excludes reports from projects where caller has no membership", async () => {
    const mike = await signIn(MIKE);
    const projectId = await freshProject(mike, MIKE.id);
    const { data: report } = await mike
      .from("reports")
      .insert({
        project_id: projectId,
        owner_id: MIKE.id,
        title: "private",
        report_type: "daily",
      })
      .select("id")
      .single();

    const sarah = await signIn(SARAH);
    const { data, error } = await sarah.rpc("pull_reports_since", {
      p_cursor: null,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    expect(data?.some((r: { id: string }) => r.id === report!.id)).toBe(false);
  });
});

describe("pull_project_members_since", () => {
  it("returns membership rows for projects the caller is in", async () => {
    const mike = await signIn(MIKE);
    const projectId = await freshProject(mike, MIKE.id);
    const { data: ownerMembership } = await mike
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", MIKE.id)
      .maybeSingle();

    const { data, error } = await mike.rpc("pull_project_members_since", {
      p_cursor: null,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    if (ownerMembership?.id) {
      expect(
        data?.some((r: { id: string }) => r.id === ownerMembership.id),
      ).toBe(true);
    }
  });
});

describe("pull_file_metadata_since", () => {
  it("returns rows only for projects owned by the caller", async () => {
    const mike = await signIn(MIKE);
    const projectId = await freshProject(mike, MIKE.id);
    const { data: fm, error: insErr } = await mike
      .from("file_metadata")
      .insert({
        project_id: projectId,
        uploaded_by: MIKE.id,
        bucket: "project-files",
        storage_path: `projects/${projectId}/${MIKE.id}/test.jpg`,
        category: "image",
        filename: "test.jpg",
        mime_type: "image/jpeg",
        size_bytes: 100,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();

    const { data: pull, error } = await mike.rpc("pull_file_metadata_since", {
      p_cursor: null,
      p_limit: 1000,
    });
    expect(error).toBeNull();
    expect(pull?.some((r: { id: string }) => r.id === fm!.id)).toBe(true);

    const sarah = await signIn(SARAH);
    const { data: sarahPull } = await sarah.rpc(
      "pull_file_metadata_since",
      { p_cursor: null, p_limit: 1000 },
    );
    expect(sarahPull?.some((r: { id: string }) => r.id === fm!.id)).toBe(false);
  });
});
