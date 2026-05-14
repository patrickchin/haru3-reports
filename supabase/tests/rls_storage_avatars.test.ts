/**
 * RLS integration tests — Supabase Storage `avatars` bucket.
 *
 * Path convention: "{user_id}/{uuid}.{ext}"
 * Policies (from 202604270001_file_upload_storage.sql):
 *   - SELECT: public
 *   - INSERT/UPDATE/DELETE: authenticated and folder == auth.uid()
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIKE,
  SARAH,
  signIn,
  anonClient,
  cleanupStorageObjects,
} from "./helpers";

const BUCKET = "avatars";

function makePath(userId: string): string {
  return `${userId}/${crypto.randomUUID()}.png`;
}

function makeBlob(): Blob {
  // Minimal PNG header is fine for a permission test (validation happens elsewhere).
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
}

describe("RLS — storage.objects (avatars)", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let anon: SupabaseClient;
  const mikePaths: string[] = [];
  const sarahPaths: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
    anon = anonClient();
  });

  afterAll(async () => {
    await cleanupStorageObjects(mike, BUCKET, mikePaths);
    await cleanupStorageObjects(sarah, BUCKET, sarahPaths);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("user can upload to their own avatar folder", async () => {
    const path = makePath(MIKE.id);
    const { error } = await mike.storage.from(BUCKET).upload(path, makeBlob());
    expect(error).toBeNull();
    mikePaths.push(path);
  });

  it("user CANNOT upload into another user's folder", async () => {
    const path = makePath(MIKE.id); // Sarah trying to write to Mike's folder
    const { error } = await sarah.storage.from(BUCKET).upload(path, makeBlob());
    expect(error).not.toBeNull();
  });

  it("anonymous client can read avatars (public bucket)", async () => {
    const path = makePath(MIKE.id);
    await mike.storage.from(BUCKET).upload(path, makeBlob());
    mikePaths.push(path);

    const { data } = anon.storage.from(BUCKET).getPublicUrl(path);
    expect(data.publicUrl).toContain(BUCKET);

    const res = await fetch(data.publicUrl);
    expect(res.ok).toBe(true);
  });

  it("user can delete their own avatar", async () => {
    const path = makePath(SARAH.id);
    await sarah.storage.from(BUCKET).upload(path, makeBlob());

    const { data, error } = await sarah.storage.from(BUCKET).remove([path]);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("user CANNOT delete another user's avatar", async () => {
    const path = makePath(MIKE.id);
    await mike.storage.from(BUCKET).upload(path, makeBlob());
    mikePaths.push(path);

    const { data, error } = await sarah.storage.from(BUCKET).remove([path]);
    // Supabase returns OK + empty array when RLS filters out the row.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});
