/**
 * RLS integration tests — `public.reports`.
 *
 * Current policies (see 202604210001_project_members.sql):
 *   - SELECT: project access via user_has_project_access() + deleted_at IS NULL
 *   - INSERT: owner_id = auth.uid() AND role IN ('owner','admin','editor')
 *   - UPDATE: role IN ('owner','admin','editor')
 *   - DELETE: owner-only (unchanged original policy)
 *
 * Tests verify the full permission matrix including the RETURNING-on-insert
 * regression (same bug class as projects — see
 * 202604230001_reports_select_owner_fastpath.sql).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIKE,
  SARAH,
  signIn,
  createOwnedProject,
  cleanupProjects,
} from "./helpers";

describe("RLS — reports", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let projectId: string;
  const createdProjects: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
    projectId = await createOwnedProject(mike, MIKE.id, "Vitest reports-proj");
    createdProjects.push(projectId);
  });

  afterAll(async () => {
    // reports will cascade on project delete
    await cleanupProjects(mike, createdProjects);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("owner can insert a report and read it back via RETURNING", async () => {
    const { data, error } = await mike
      .from("reports")
      .insert({
        project_id: projectId,
        owner_id: MIKE.id,
        title: "Vitest report",
      })
      .select("id, title, owner_id")
      .single();

    expect(error).toBeNull();
    expect(data!.title).toBe("Vitest report");
  });

  it("stranger cannot see reports under a project they don't belong to", async () => {
    const { data: inserted } = await mike
      .from("reports")
      .insert({
        project_id: projectId,
        owner_id: MIKE.id,
        title: "Vitest mike-only report",
      })
      .select("id")
      .single();

    const { data } = await sarah
      .from("reports")
      .select("id")
      .eq("id", inserted!.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("stranger (not a member) cannot insert reports into the project", async () => {
    const { error } = await sarah
      .from("reports")
      .insert({
        project_id: projectId,
        owner_id: SARAH.id,
        title: "Vitest sarah-tries",
      })
      .select("id")
      .single();

    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("only the owner can delete a report (not a mere editor)", async () => {
    // Mike inserts report.
    const { data: ins } = await mike
      .from("reports")
      .insert({
        project_id: projectId,
        owner_id: MIKE.id,
        title: "Vitest owner-only delete",
      })
      .select("id")
      .single();
    const id = ins!.id;

    // Mike grants Sarah editor role on project.
    await mike.from("project_members").insert({
      project_id: projectId,
      user_id: SARAH.id,
      role: "editor",
      invited_by: MIKE.id,
    });

    // Sarah can see it.
    const { data: visible } = await sarah
      .from("reports")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    expect(visible?.id).toBe(id);

    // Sarah cannot delete it (owner-only).
    const { data: deleted, error: delErr } = await sarah
      .from("reports")
      .delete()
      .eq("id", id)
      .select("id");
    expect(delErr).toBeNull();
    expect(deleted).toEqual([]);

    // Cleanup membership.
    await mike
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);
  });
});
