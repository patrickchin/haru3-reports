/**
 * RLS integration tests — `public.file_metadata`.
 *
 * Policies (from 202604270001_file_upload_storage.sql):
 *   - SELECT: project members, deleted_at IS NULL
 *   - INSERT: editor/admin/owner AND uploaded_by = auth.uid()
 *   - UPDATE: uploader OR admin/owner
 *   - DELETE: uploader OR admin/owner
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIKE,
  SARAH,
  signIn,
  createOwnedProject,
  cleanupProjects,
  cleanupFileMetadata,
} from "./helpers";

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

async function insertFile(
  client: SupabaseClient,
  args: {
    projectId: string;
    uploadedBy: string;
    category?: string;
    storagePath?: string;
    filename?: string;
  },
) {
  const path =
    args.storagePath ??
    `${args.projectId}/documents/${crypto.randomUUID()}.pdf`;
  return await client
    .from("file_metadata")
    .insert({
      project_id: args.projectId,
      uploaded_by: args.uploadedBy,
      category: args.category ?? "document",
      storage_path: path,
      filename: args.filename ?? "test.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
    })
    .select("id, storage_path")
    .single();
}

describe("RLS — file_metadata", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let mikeProject: string;          // Mike-owned, Sarah is editor
  let mikeIsolated: string;         // Mike-owned, Sarah has no access
  let mikeViewerProject: string;    // Mike-owned, Sarah is viewer only
  const createdProjects: string[] = [];
  const createdFiles: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);

    mikeProject = await createOwnedProject(mike, MIKE.id, "Vitest fm-shared");
    mikeIsolated = await createOwnedProject(mike, MIKE.id, "Vitest fm-isolated");
    mikeViewerProject = await createOwnedProject(mike, MIKE.id, "Vitest fm-viewer");
    createdProjects.push(mikeProject, mikeIsolated, mikeViewerProject);

    await addMember(mike, mikeProject, SARAH.id, "editor", MIKE.id);
    await addMember(mike, mikeViewerProject, SARAH.id, "viewer", MIKE.id);
  });

  afterAll(async () => {
    await cleanupFileMetadata(mike, createdFiles);
    await cleanupProjects(mike, createdProjects);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("owner can insert file_metadata for their project", async () => {
    const { data, error } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
    });
    expect(error).toBeNull();
    expect(data!.id).toBeTruthy();
    createdFiles.push(data!.id);
  });

  it("editor member can insert file_metadata", async () => {
    const { data, error } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
    });
    expect(error).toBeNull();
    createdFiles.push(data!.id);
  });

  it("editor cannot spoof uploaded_by to someone else", async () => {
    const { error } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: MIKE.id, // Sarah claiming Mike uploaded
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("viewer cannot insert file_metadata", async () => {
    const { error } = await insertFile(sarah, {
      projectId: mikeViewerProject,
      uploadedBy: SARAH.id,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("non-member cannot insert file_metadata", async () => {
    const { error } = await insertFile(sarah, {
      projectId: mikeIsolated,
      uploadedBy: SARAH.id,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("non-member cannot SELECT files in another project", async () => {
    const { data: inserted } = await insertFile(mike, {
      projectId: mikeIsolated,
      uploadedBy: MIKE.id,
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .select("id")
      .eq("id", inserted!.id);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("editor member can SELECT files in shared project", async () => {
    const { data: inserted } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .select("id")
      .eq("id", inserted!.id);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("viewer member CAN SELECT (read-only) files in their project", async () => {
    const { data: inserted } = await insertFile(mike, {
      projectId: mikeViewerProject,
      uploadedBy: MIKE.id,
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .select("id")
      .eq("id", inserted!.id);
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("uploader can UPDATE their own file (e.g. set transcription)", async () => {
    const { data: inserted } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
      category: "voice-note",
      filename: "note.m4a",
    });
    createdFiles.push(inserted!.id);

    const { error } = await sarah
      .from("file_metadata")
      .update({ transcription: "hello world" })
      .eq("id", inserted!.id);
    expect(error).toBeNull();
  });

  it("non-uploader editor CANNOT update someone else's file", async () => {
    const { data: inserted } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .update({ transcription: "hijack" })
      .eq("id", inserted!.id)
      .select("id");
    // RLS hides the row from UPDATE — no error, but no rows affected.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("admin can UPDATE any file in their project", async () => {
    // Promote Sarah to admin temporarily for this assertion.
    await mike
      .from("project_members")
      .update({ role: "admin" })
      .eq("project_id", mikeProject)
      .eq("user_id", SARAH.id);

    const { data: inserted } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .update({ transcription: "admin-set" })
      .eq("id", inserted!.id)
      .select("id, transcription");
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].transcription).toBe("admin-set");

    await mike
      .from("project_members")
      .update({ role: "editor" })
      .eq("project_id", mikeProject)
      .eq("user_id", SARAH.id);
  });

  it("uploader can DELETE their own file", async () => {
    const { data: inserted } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
    });

    const { error, data } = await sarah
      .from("file_metadata")
      .delete()
      .eq("id", inserted!.id)
      .select("id");
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("non-member cannot DELETE files in another project", async () => {
    const { data: inserted } = await insertFile(mike, {
      projectId: mikeIsolated,
      uploadedBy: MIKE.id,
    });
    createdFiles.push(inserted!.id);

    const { error, data } = await sarah
      .from("file_metadata")
      .delete()
      .eq("id", inserted!.id)
      .select("id");
    expect(error).toBeNull(); // RLS hides → no error
    expect(data ?? []).toEqual([]);
  });
});
