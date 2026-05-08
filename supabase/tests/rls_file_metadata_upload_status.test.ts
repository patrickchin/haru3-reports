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
  CHARLIE,
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
  let charlie: SupabaseClient; // no project membership at all
  let mikeProject: string; // Mike-owned, Sarah is editor
  const createdProjects: string[] = [];
  const createdFiles: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
    charlie = await signIn(CHARLIE);

    mikeProject = await createOwnedProject(mike, MIKE.id, "Vitest fm-upload-status");
    createdProjects.push(mikeProject);
    await addMember(mike, mikeProject, SARAH.id, "editor", MIKE.id);
  });

  afterAll(async () => {
    await cleanupFileMetadata(mike, createdFiles);
    await cleanupProjects(mike, createdProjects);
    await mike.auth.signOut();
    await sarah.auth.signOut();
    await charlie.auth.signOut();
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

  // ---------------------------------------------------------------
  // PR-7b placeholder-row pattern
  //
  // The uploader inserts a row with a sentinel storage_path
  // (`__pending__/<uuid>`) + local_uri set, then on success rewrites
  // both columns in the same UPDATE that flips upload_status to
  // 'completed'. The trigger must permit storage_path + local_uri
  // mutation in that transition, and RLS must accept a row whose
  // storage_path doesn't yet correspond to a real Storage object.
  // ---------------------------------------------------------------

  it("placeholder pattern: insert pending with sentinel path + local_uri", async () => {
    const id = crypto.randomUUID();
    const sentinel = `__pending__/${id}`;
    const { data, error } = await sarah
      .from("file_metadata")
      .insert({
        project_id: mikeProject,
        uploaded_by: SARAH.id,
        category: "image",
        storage_path: sentinel,
        filename: "shot.jpg",
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "pending",
        local_uri: "file:///tmp/shot.jpg",
      })
      .select("id, storage_path, local_uri, upload_status")
      .single();
    expect(error).toBeNull();
    expect(data!.upload_status).toBe("pending");
    expect(data!.storage_path).toBe(sentinel);
    expect(data!.local_uri).toBe("file:///tmp/shot.jpg");
    createdFiles.push(data!.id);
  });

  it("placeholder pattern: pending->completed rewrites storage_path AND clears local_uri", async () => {
    const id = crypto.randomUUID();
    const sentinel = `__pending__/${id}`;
    const realPath = `${mikeProject}/images/${id}.jpg`;

    const { data: inserted } = await sarah
      .from("file_metadata")
      .insert({
        project_id: mikeProject,
        uploaded_by: SARAH.id,
        category: "image",
        storage_path: sentinel,
        filename: "shot.jpg",
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "pending",
        local_uri: "file:///tmp/shot.jpg",
      })
      .select("id")
      .single();
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .update({
        storage_path: realPath,
        upload_status: "completed",
        local_uri: null,
      })
      .eq("id", inserted!.id)
      .select("storage_path, upload_status, local_uri")
      .single();
    expect(error).toBeNull();
    expect(data!.storage_path).toBe(realPath);
    expect(data!.upload_status).toBe("completed");
    expect(data!.local_uri).toBeNull();
  });

  it("placeholder pattern: pending->failed clears local_uri", async () => {
    const id = crypto.randomUUID();
    const sentinel = `__pending__/${id}`;

    const { data: inserted } = await sarah
      .from("file_metadata")
      .insert({
        project_id: mikeProject,
        uploaded_by: SARAH.id,
        category: "image",
        storage_path: sentinel,
        filename: "shot.jpg",
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "pending",
        local_uri: "file:///tmp/shot.jpg",
      })
      .select("id")
      .single();
    createdFiles.push(inserted!.id);

    const { data, error } = await sarah
      .from("file_metadata")
      .update({ upload_status: "failed", local_uri: null })
      .eq("id", inserted!.id)
      .select("upload_status, local_uri")
      .single();
    expect(error).toBeNull();
    expect(data!.upload_status).toBe("failed");
    expect(data!.local_uri).toBeNull();
  });

  // ---------------------------------------------------------------
  // No-access user (M4 follow-up from media-pipeline review)
  //
  // CHARLIE has no membership in any project. The placeholder-row
  // INSERT policy is `WITH CHECK (uploaded_by = auth.uid() AND
  // user_has_project_access(project_id, auth.uid()))`, so any attempt
  // to seed a pending row in someone else's project (or to mutate one
  // that already exists) must be blocked at the RLS layer regardless
  // of the state-machine trigger.
  // ---------------------------------------------------------------

  it("unrelated user cannot INSERT a pending placeholder into someone else's project", async () => {
    const { error } = await insertFile(charlie, {
      projectId: mikeProject,
      uploadedBy: CHARLIE.id,
      uploadStatus: "pending",
    });
    // PostgREST surfaces RLS WITH CHECK violations as 42501 / 23514.
    expect(error).not.toBeNull();
    expect(["42501", "23514"]).toContain(error!.code ?? "");
  });

  it("unrelated user cannot UPDATE another user's pending row (RLS hides it)", async () => {
    // Mike inserts a pending row that Charlie has no business seeing.
    const { data: inserted } = await insertFile(mike, {
      projectId: mikeProject,
      uploadedBy: MIKE.id,
      uploadStatus: "pending",
    });
    createdFiles.push(inserted!.id);

    const { data, error } = await charlie
      .from("file_metadata")
      .update({ upload_status: "completed" })
      .eq("id", inserted!.id)
      .select("id");
    // RLS hides the row from UPDATE — no error, but zero rows affected.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});
