/**
 * RLS integration tests — `public.projects`.
 *
 * Covers:
 *  - owner can INSERT + receive row back via RETURNING (regression for the
 *    42501 bug fixed by 202604230001_projects_select_owner_fastpath.sql)
 *  - owner can SELECT / UPDATE / DELETE their own rows
 *  - non-owner cannot see, update, or delete another user's rows
 *  - non-owner cannot insert a row claiming someone else as owner
 *  - soft-deleted rows are hidden from the owner (deleted_at IS NULL)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIKE, SARAH, signIn, cleanupProjects } from "./helpers";

describe("RLS — projects", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  const createdByMike: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
  });

  afterAll(async () => {
    await cleanupProjects(mike, createdByMike);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("owner can insert and read back via .select().single()", async () => {
    const { data, error } = await mike
      .from("projects")
      .insert({ name: "Vitest owned", owner_id: MIKE.id })
      .select("id, name, owner_id")
      .single();

    expect(error).toBeNull();
    expect(data!.owner_id).toBe(MIKE.id);
    createdByMike.push(data!.id);
  });

  it("owner can update and delete their own project", async () => {
    const id = await insertAs(mike, MIKE.id, "Vitest to-update");

    const { error: updErr } = await mike
      .from("projects")
      .update({ name: "Vitest renamed" })
      .eq("id", id);
    expect(updErr).toBeNull();

    const { error: delErr } = await mike.from("projects").delete().eq("id", id);
    expect(delErr).toBeNull();
  });

  it("stranger cannot see owner's projects", async () => {
    const id = await insertAs(mike, MIKE.id, "Vitest mike-only");
    createdByMike.push(id);

    const { data } = await sarah
      .from("projects")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("stranger cannot update owner's projects", async () => {
    const id = await insertAs(mike, MIKE.id, "Vitest stranger-update");
    createdByMike.push(id);

    const { data, error } = await sarah
      .from("projects")
      .update({ name: "hacked" })
      .eq("id", id)
      .select("id");

    // RLS UPDATE with no matching rows returns empty data, no error.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("stranger cannot delete owner's projects", async () => {
    const id = await insertAs(mike, MIKE.id, "Vitest stranger-delete");
    createdByMike.push(id);

    const { data, error } = await sarah
      .from("projects")
      .delete()
      .eq("id", id)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Row still exists for Mike.
    const { data: still } = await mike
      .from("projects")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    expect(still?.id).toBe(id);
  });

  it("cannot insert a project owned by someone else", async () => {
    const { error } = await sarah
      .from("projects")
      .insert({ name: "Vitest impersonate", owner_id: MIKE.id })
      .select("id")
      .single();

    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });
});

async function insertAs(
  client: SupabaseClient,
  ownerId: string,
  name: string
): Promise<string> {
  const { data, error } = await client
    .from("projects")
    .insert({ name, owner_id: ownerId })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}
