/**
 * RLS + state-machine integration tests — `file_metadata.upload_status`.
 *
 * Migration: 202605080001_file_metadata_upload_status.sql
 *
 * State machine (DB layer):
 *   pending   -> completed | failed
 *   failed    -> pending          (retry)
 *   completed -> (terminal)
 *
 * Covers:
 *   1. Default INSERT lands at 'completed' (back-compat).
 *   2. Uploader can insert with upload_status='pending'.
 *   3. Uploader can advance pending -> completed.
 *   4. Uploader can retry: failed -> pending.
 *   5. Invalid transition completed -> pending raises 22023
 *      (one-way state machine).
 *   6. Identity columns (uploaded_by) are immutable via direct UPDATE
 *      (raises 22023).
 *   7. Non-uploader editor cannot UPDATE upload_status of someone
 *      else's file (RLS hides the row).
 *   8. Project admin CAN advance another user's pending row to 'failed'.
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
    uploadStatus?: "pending" | "completed" | "failed";
    storagePath?: string;
  },
) {
  const path =
    args.storagePath ??
    `${args.projectId}/images/${crypto.randomUUID()}.jpg`;
  return await client
    .from("file_metadata")
    .insert({
      project_id: args.projectId,
      uploaded_by: args.uploadedBy,
      category: "image",
      storage_path: path,
      filename: "queued.jpg",
      mime_type: "image/jpeg",
      size_bytes: 2048,
      ...(args.uploadStatus ? { upload_status: args.uploadStatus } : {}),
    })
    .select("id, upload_status, project_id, uploaded_by")
    .single();
}

describe("RLS + state machine — file_metadata.upload_status", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let mikeProject: string; // Mike-owned, Sarah is editor
  const createdProjects: string[] = [];
  const createdFiles: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);

    mikeProject = await createOwnedProject(mike, MIKE.id, "Vitest fm-upload-status");
    createdProjects.push(mikeProject);
    await addMember(mike, mikeProject, SARAH.id, "editor", MIKE.id);
  });

  afterAll(async () => {
    await cleanupFileMetadata(mike, createdFiles);
    await cleanupProjects(mike, createdProjects);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  it("defaults upload_status to 'completed' when omitted (back-compat)", async () => {
    const { data, error } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
    });
    expect(error).toBeNull();
    expect(data!.upload_status).toBe("completed");
    createdFiles.push(data!.id);
  });

  it("uploader can insert with upload_status='pending'", async () => {
    const { data, error } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
      uploadStatus: "pending",
    });
    expect(error).toBeNull();
    expect(data!.upload_status).toBe("pending");
    createdFiles.push(data!.id);
  });

  it("uploader can advance pending -> completed", async () => {
    const { data: inserted } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
      uploadStatus: "pending",
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .update({ upload_status: "completed" })
      .eq("id", inserted!.id)
      .select("upload_status")
      .single();
    expect(error).toBeNull();
    expect(data!.upload_status).toBe("completed");
  });

  it("uploader can retry: failed -> pending", async () => {
    const { data: inserted } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
      uploadStatus: "pending",
    });
    createdFiles.push(inserted!.id);

    // pending -> failed
    const failStep = await sarah
      .from("file_metadata")
      .update({ upload_status: "failed" })
      .eq("id", inserted!.id)
      .select("upload_status")
      .single();
    expect(failStep.error).toBeNull();
    expect(failStep.data!.upload_status).toBe("failed");

    // failed -> pending (retry)
    const retryStep = await sarah
      .from("file_metadata")
      .update({ upload_status: "pending" })
      .eq("id", inserted!.id)
      .select("upload_status")
      .single();
    expect(retryStep.error).toBeNull();
    expect(retryStep.data!.upload_status).toBe("pending");
  });

  it("rejects invalid transition completed -> pending (22023, one-way)", async () => {
    const { data: inserted } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
      // defaults to 'completed'
    });
    createdFiles.push(inserted!.id);

    const { error } = await sarah
      .from("file_metadata")
      .update({ upload_status: "pending" })
      .eq("id", inserted!.id);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("22023");
  });

  it("rejects invalid transition completed -> failed (22023, terminal)", async () => {
    const { data: inserted } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
      // defaults to 'completed'
    });
    createdFiles.push(inserted!.id);

    const { error } = await sarah
      .from("file_metadata")
      .update({ upload_status: "failed" })
      .eq("id", inserted!.id);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("22023");
  });

  it("rejects mutation of immutable identity columns (22023)", async () => {
    const { data: inserted } = await insertFile(sarah, {
      projectId: mikeProject,
      uploadedBy: SARAH.id,
      uploadStatus: "pending",
    });
    createdFiles.push(inserted!.id);

    // Attempt to reassign uploaded_by to Mike via direct UPDATE.
    const { error } = await sarah
      .from("file_metadata")
      .update({ uploaded_by: MIKE.id })
      .eq("id", inserted!.id);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("22023");
  });

  it("non-uploader editor cannot UPDATE upload_status (RLS hides row)", async () => {
    // Mike inserts a pending row; Sarah (editor, not uploader) tries to advance it.
    const { data: inserted } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
      uploadStatus: "pending",
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .update({ upload_status: "completed" })
      .eq("id", inserted!.id)
      .select("id");
    // RLS hides the row from UPDATE — no error, but zero rows affected.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("project admin CAN advance another uploader's pending row to 'failed'", async () => {
    // Promote Sarah to admin, then have her fail Mike's pending upload.
    await mike
      .from("project_members")
      .update({ role: "admin" })
      .eq("project_id", mikeProject)
      .eq("user_id", SARAH.id);

    const { data: inserted } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
      uploadStatus: "pending",
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .update({ upload_status: "failed" })
      .eq("id", inserted!.id)
      .select("id, upload_status");
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].upload_status).toBe("failed");

    // Restore role for any subsequent tests/teardown.
    await mike
      .from("project_members")
      .update({ role: "editor" })
      .eq("project_id", mikeProject)
      .eq("user_id", SARAH.id);
  });
});
