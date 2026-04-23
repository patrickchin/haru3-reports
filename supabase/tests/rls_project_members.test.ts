/**
 * RLS integration tests — `public.project_members`.
 *
 * Policies (from 202604210001_project_members.sql):
 *   - SELECT: any member/owner of the project
 *   - INSERT: user_project_role IN ('owner', 'admin')
 *   - UPDATE: user_project_role IN ('owner', 'admin')
 *   - DELETE: user_project_role IN ('owner', 'admin')
 *
 * Also sanity-checks the SECURITY DEFINER RPC `get_project_team` which the
 * mobile app uses to list teammates without exposing phone numbers.
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

describe("RLS — project_members", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let projectId: string;
  const createdProjects: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
    projectId = await createOwnedProject(mike, MIKE.id, "Vitest members-proj");
    createdProjects.push(projectId);
  });

  afterAll(async () => {
    await cleanupProjects(mike, createdProjects);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("owner can add a member", async () => {
    const { data, error } = await mike
      .from("project_members")
      .insert({
        project_id: projectId,
        user_id: SARAH.id,
        role: "viewer",
        invited_by: MIKE.id,
      })
      .select("id, role")
      .single();

    expect(error).toBeNull();
    expect(data!.role).toBe("viewer");
  });

  it("non-admin member (viewer) cannot add another member", async () => {
    // Sarah is currently a viewer from the previous test.
    const { error } = await sarah
      .from("project_members")
      .insert({
        project_id: projectId,
        user_id: MIKE.id, // arbitrary — policy should reject before constraint
        role: "viewer",
        invited_by: SARAH.id,
      })
      .select("id")
      .single();

    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("viewer can see the member list via get_project_team", async () => {
    const { data, error } = await sarah.rpc("get_project_team", {
      p_project_id: projectId,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const ids = (data as Array<{ user_id: string }>).map((r) => r.user_id);
    expect(ids).toContain(MIKE.id);
    expect(ids).toContain(SARAH.id);
  });

  it("non-member cannot call get_project_team for someone else's project", async () => {
    // Create a second project Sarah is NOT part of.
    const isolatedId = await createOwnedProject(
      mike,
      MIKE.id,
      "Vitest isolated-proj"
    );
    createdProjects.push(isolatedId);

    const { data } = await sarah.rpc("get_project_team", {
      p_project_id: isolatedId,
    });
    expect(data ?? []).toEqual([]);
  });

  it("owner can remove a member", async () => {
    const { error } = await mike
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);

    expect(error).toBeNull();
  });
});
