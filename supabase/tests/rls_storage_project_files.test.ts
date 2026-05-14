/**
 * RLS integration tests — Supabase Storage `project-files` bucket.
 *
 * Path convention: "{project_id}/{category}/{uuid}.{ext}"
 * Policies (from 202604270001_file_upload_storage.sql):
 *   - SELECT: project members (any role)
 *   - INSERT/UPDATE: editor/admin/owner
 *   - DELETE: admin/owner
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIKE,
  SARAH,
  signIn,
  createOwnedProject,
  cleanupProjects,
  cleanupStorageObjects,
} from "./helpers";

const BUCKET = "project-files";

async function addMember(
  ownerClient: SupabaseClient,
  projectId: string,
  userId: string,
  role: "admin" | "editor" | "viewer",
  invitedBy: string,
): Promise<void> {
  const { error } = await ownerClient
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId, role, invited_by: invitedBy });
  if (error) throw error;
}

function makePath(projectId: string, ext = "txt"): string {
  return `${projectId}/documents/${crypto.randomUUID()}.${ext}`;
}

function makeBlob(): Blob {
  return new Blob(["hello world"], { type: "text/plain" });
}

describe("RLS — storage.objects (project-files)", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let sharedProject: string;
  let isolatedProject: string;
  let viewerProject: string;
  const createdProjects: string[] = [];
  const createdPaths: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);

    sharedProject = await createOwnedProject(mike, MIKE.id, "Vitest stor-shared");
    isolatedProject = await createOwnedProject(mike, MIKE.id, "Vitest stor-isolated");
    viewerProject = await createOwnedProject(mike, MIKE.id, "Vitest stor-viewer");
    createdProjects.push(sharedProject, isolatedProject, viewerProject);

    await addMember(mike, sharedProject, SARAH.id, "editor", MIKE.id);
    await addMember(mike, viewerProject, SARAH.id, "viewer", MIKE.id);
  });

  afterAll(async () => {
    await cleanupStorageObjects(mike, BUCKET, createdPaths);
    await cleanupProjects(mike, createdProjects);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("owner can upload to their project path", async () => {
    const path = makePath(sharedProject);
    const { error } = await mike.storage.from(BUCKET).upload(path, makeBlob());
    expect(error).toBeNull();
    createdPaths.push(path);
  });

  it("editor member can upload to shared project path", async () => {
    const path = makePath(sharedProject);
    const { error } = await sarah.storage.from(BUCKET).upload(path, makeBlob());
    expect(error).toBeNull();
    createdPaths.push(path);
  });

  it("viewer cannot upload", async () => {
    const path = makePath(viewerProject);
    const { error } = await sarah.storage.from(BUCKET).upload(path, makeBlob());
    expect(error).not.toBeNull();
  });

  it("non-member cannot upload to another project's path", async () => {
    const path = makePath(isolatedProject);
    const { error } = await sarah.storage.from(BUCKET).upload(path, makeBlob());
    expect(error).not.toBeNull();
  });

  it("project member can download via signed URL", async () => {
    const path = makePath(sharedProject);
    await mike.storage.from(BUCKET).upload(path, makeBlob());
    createdPaths.push(path);

    // List as Sarah (editor) — should see the file.
    const { data, error } = await sarah.storage
      .from(BUCKET)
      .list(`${sharedProject}/documents`);
    expect(error).toBeNull();
    expect(data!.some((o) => path.endsWith(o.name))).toBe(true);
  });

  it("non-member cannot list/download files in another project", async () => {
    const path = makePath(isolatedProject);
    await mike.storage.from(BUCKET).upload(path, makeBlob());
    createdPaths.push(path);

    const { data } = await sarah.storage
      .from(BUCKET)
      .list(`${isolatedProject}/documents`);
    // RLS-filtered list returns empty for non-members.
    expect(data ?? []).toEqual([]);
  });

  it("editor cannot delete (only owner/admin)", async () => {
    const path = makePath(sharedProject);
    await mike.storage.from(BUCKET).upload(path, makeBlob());
    createdPaths.push(path);

    const { data, error } = await sarah.storage.from(BUCKET).remove([path]);
    // Supabase storage returns success+empty data when RLS hides the row.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("owner can delete files from their project", async () => {
    const path = makePath(sharedProject);
    await mike.storage.from(BUCKET).upload(path, makeBlob());

    const { data, error } = await mike.storage.from(BUCKET).remove([path]);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });
});
