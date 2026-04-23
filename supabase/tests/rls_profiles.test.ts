/**
 * RLS integration tests — `public.profiles`.
 *
 * Policy (202603190001_users_profiles.sql):
 *   - INSERT / SELECT / UPDATE: auth.uid() = id   (own row only)
 *
 * Teammate visibility goes through the SECURITY DEFINER RPCs
 * (`get_project_team`, `lookup_profile_id_by_phone`) — direct access
 * to another user's profile row must be denied so phone numbers and
 * other sensitive columns are not exposed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIKE, SARAH, signIn } from "./helpers";

describe("RLS — profiles", () => {
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

  it("can read own profile", async () => {
    const { data, error } = await mike
      .from("profiles")
      .select("id, phone, full_name")
      .eq("id", MIKE.id)
      .single();

    expect(error).toBeNull();
    expect(data!.id).toBe(MIKE.id);
    expect(data!.phone).toBe("+15551234567");
  });

  it("cannot read another user's profile directly", async () => {
    const { data } = await mike
      .from("profiles")
      .select("id, phone")
      .eq("id", SARAH.id)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it("can update own profile", async () => {
    const newName = `Mike Torres (vitest ${Date.now()})`;
    const { error } = await mike
      .from("profiles")
      .update({ full_name: newName })
      .eq("id", MIKE.id);
    expect(error).toBeNull();

    const { data } = await mike
      .from("profiles")
      .select("full_name")
      .eq("id", MIKE.id)
      .single();
    expect(data!.full_name).toBe(newName);

    // Restore the seeded name.
    await mike
      .from("profiles")
      .update({ full_name: "Mike Torres" })
      .eq("id", MIKE.id);
  });

  it("cannot update another user's profile", async () => {
    const { data, error } = await mike
      .from("profiles")
      .update({ full_name: "hacked" })
      .eq("id", SARAH.id)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Sarah's row untouched.
    const { data: sarahRow } = await sarah
      .from("profiles")
      .select("full_name")
      .eq("id", SARAH.id)
      .single();
    expect(sarahRow!.full_name).not.toBe("hacked");
  });

  it("lookup_profile_id_by_phone returns only the id, not the full profile", async () => {
    const { data, error } = await mike.rpc("lookup_profile_id_by_phone", {
      p_phone: "+15559876543",
    });

    expect(error).toBeNull();
    expect(data).toBe(SARAH.id);
  });
});
