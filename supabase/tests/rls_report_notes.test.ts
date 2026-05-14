/**
 * RLS integration tests — `public.report_notes`.
 *
 * Policies (from 202604300001_report_notes.sql):
 *   - SELECT: project members, deleted_at IS NULL
 *   - INSERT: editor/admin/owner AND author_id = auth.uid()
 *   - UPDATE: author OR project owner/admin
 *   - DELETE: author OR project owner/admin
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

async function insertReport(
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
): Promise<string> {
  const { data, error } = await client
    .from("reports")
    .insert({
      project_id: projectId,
      owner_id: ownerId,
      title: "vitest-report",
      report_type: "daily",
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function insertNote(
  client: SupabaseClient,
  args: {
    reportId: string;
    projectId: string;
    authorId: string;
    position?: number;
    kind?: string;
    body?: string | null;
    fileId?: string | null;
  },
) {
  return client
    .from("report_notes")
    .insert({
      report_id: args.reportId,
      project_id: args.projectId,
      author_id: args.authorId,
      position: args.position ?? 1,
      kind: args.kind ?? "text",
      body: args.body ?? "test note",
      file_id: args.fileId ?? null,
    })
    .select("id, body, kind, position, author_id, file_id")
    .single();
}

async function insertFile(
  client: SupabaseClient,
  args: {
    projectId: string;
    uploadedBy: string;
    storagePath?: string;
  },
): Promise<string> {
  const { data, error } = await client
    .from("file_metadata")
    .insert({
      project_id: args.projectId,
      uploaded_by: args.uploadedBy,
      category: "voice-note",
      storage_path:
        args.storagePath ?? `${args.projectId}/voice/${crypto.randomUUID()}.m4a`,
      filename: "note.m4a",
      mime_type: "audio/m4a",
      size_bytes: 1024,
      duration_ms: 1000,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

describe("RLS — report_notes", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let projectId: string;
  let otherProjectId: string;
  let reportId: string;
  let sameProjectOtherReportId: string;
  let otherReportId: string;
  let sameProjectFileId: string;
  let otherProjectFileId: string;
  const noteIds: string[] = [];
  const createdProjects: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
    projectId = await createOwnedProject(mike, MIKE.id);
    createdProjects.push(projectId);
    reportId = await insertReport(mike, projectId, MIKE.id);
    sameProjectOtherReportId = await insertReport(mike, projectId, MIKE.id);
    otherProjectId = await createOwnedProject(mike, MIKE.id);
    createdProjects.push(otherProjectId);
    otherReportId = await insertReport(mike, otherProjectId, MIKE.id);
    await addMember(mike, projectId, SARAH.id, "editor", MIKE.id);
    await addMember(mike, otherProjectId, SARAH.id, "editor", MIKE.id);
    sameProjectFileId = await insertFile(mike, {
      projectId,
      uploadedBy: MIKE.id,
    });
    otherProjectFileId = await insertFile(mike, {
      projectId: otherProjectId,
      uploadedBy: MIKE.id,
    });
  });

  afterAll(async () => {
    // Cascade: deleting the project removes reports → report_notes
    await cleanupProjects(mike, createdProjects);
    await mike.auth.signOut();
    await sarah.auth.signOut();
  });

  // ---- INSERT ----

  it("owner can insert a note", async () => {
    const { data, error } = await insertNote(mike, {
      reportId,
      projectId,
      authorId: MIKE.id,
    });
    expect(error).toBeNull();
    expect(data!.body).toBe("test note");
    noteIds.push(data!.id);
  });

  it("editor can insert a note", async () => {
    const { data, error } = await insertNote(sarah, {
      reportId,
      projectId,
      authorId: SARAH.id,
      position: 2,
      body: "sarah note",
    });
    expect(error).toBeNull();
    expect(data!.body).toBe("sarah note");
    noteIds.push(data!.id);
  });

  it("rejects insert when report_id belongs to a different project_id", async () => {
    const { data, error } = await insertNote(sarah, {
      reportId: otherReportId,
      projectId,
      authorId: SARAH.id,
      position: 8,
      body: "cross-project mismatch",
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("rejects insert when file_id belongs to a different project_id", async () => {
    const { data, error } = await insertNote(sarah, {
      reportId,
      projectId,
      authorId: SARAH.id,
      position: 9,
      kind: "voice",
      body: null,
      fileId: otherProjectFileId,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("rejects insert when file_id points to a soft-deleted file", async () => {
    const fileId = await insertFile(mike, {
      projectId,
      uploadedBy: MIKE.id,
      storagePath: `${projectId}/voice/deleted-file-${crypto.randomUUID()}.m4a`,
    });
    const { error: softDeleteError } = await mike.rpc(
      "soft_delete_file_metadata",
      { p_id: fileId },
    );
    expect(softDeleteError).toBeNull();

    const { data, error } = await insertNote(sarah, {
      reportId,
      projectId,
      authorId: SARAH.id,
      position: 10,
      kind: "voice",
      body: null,
      fileId,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("rejects insert if author_id != caller", async () => {
    const { error } = await insertNote(sarah, {
      reportId,
      projectId,
      authorId: MIKE.id, // impersonation attempt
      position: 3,
      body: "sneaky",
    });
    expect(error).not.toBeNull();
  });

  // ---- SELECT ----

  it("members can read non-deleted notes", async () => {
    const { data, error } = await sarah
      .from("report_notes")
      .select("id")
      .eq("report_id", reportId);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
  });

  it("stranger cannot read notes", async () => {
    // Remove sarah's membership to test stranger access
    await mike
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);

    const { data, error } = await sarah
      .from("report_notes")
      .select("id")
      .eq("report_id", reportId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // Re-add sarah for subsequent tests
    await addMember(mike, projectId, SARAH.id, "editor", MIKE.id);
  });

  // ---- UPDATE ----

  it("author can update own note", async () => {
    const noteId = noteIds[1]!; // sarah's note
    const { error } = await sarah
      .from("report_notes")
      .update({ body: "updated" })
      .eq("id", noteId);
    expect(error).toBeNull();

    const { data } = await sarah
      .from("report_notes")
      .select("body")
      .eq("id", noteId)
      .single();
    expect(data!.body).toBe("updated");
  });

  it("project owner can update any note", async () => {
    const noteId = noteIds[1]!; // sarah's note
    const { error } = await mike
      .from("report_notes")
      .update({ body: "owner-edited" })
      .eq("id", noteId);
    expect(error).toBeNull();
  });

  it("rejects updates to report note identity and linkage columns", async () => {
    const noteId = noteIds[1]!; // sarah's note
    const updates = [
      { id: crypto.randomUUID() },
      { report_id: sameProjectOtherReportId },
      { report_id: otherReportId, project_id: otherProjectId },
      { author_id: MIKE.id },
      { file_id: sameProjectFileId },
    ];

    for (const patch of updates) {
      const { data, error } = await sarah
        .from("report_notes")
        .update(patch)
        .eq("id", noteId)
        .select("id")
        .single();

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.message).toContain(
        "report_notes identity/linkage columns are immutable",
      );
    }
  });

  it("removed note author cannot update or delete their prior note", async () => {
    const noteId = noteIds[1]!; // sarah's note

    await mike
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);

    const { data: updateData, error: updateError } = await sarah
      .from("report_notes")
      .update({ body: "removed-author-edit" })
      .eq("id", noteId)
      .select("id");
    expect(updateError).toBeNull();
    expect(updateData).toEqual([]);

    const { data: deleteData, error: deleteError } = await sarah
      .from("report_notes")
      .delete()
      .eq("id", noteId)
      .select("id");
    expect(deleteError).toBeNull();
    expect(deleteData).toEqual([]);

    const { data: visibleNotes, error: visibleNotesError } = await mike
      .from("report_notes")
      .select("id, body")
      .eq("id", noteId)
      .single();
    expect(visibleNotesError).toBeNull();
    expect(visibleNotes).toMatchObject({ id: noteId, body: "owner-edited" });

    await addMember(mike, projectId, SARAH.id, "editor", MIKE.id);
  });

  it("note author cannot directly revive a soft-deleted linked note", async () => {
    const fileId = await insertFile(mike, {
      projectId,
      uploadedBy: MIKE.id,
      storagePath: `${projectId}/voice/revive-${crypto.randomUUID()}.m4a`,
    });
    const { data: note, error: insertError } = await insertNote(sarah, {
      reportId,
      projectId,
      authorId: SARAH.id,
      position: 15,
      kind: "voice",
      body: null,
      fileId,
    });
    expect(insertError).toBeNull();
    noteIds.push(note!.id);

    const { error: cascadeError } = await mike.rpc(
      "soft_delete_report_notes_for_file",
      { p_file_id: fileId },
    );
    expect(cascadeError).toBeNull();

    const { data: reviveData, error: reviveError } = await sarah
      .from("report_notes")
      .update({ deleted_at: null })
      .eq("id", note!.id)
      .select("id");
    expect(reviveError).toBeNull();
    expect(reviveData).toEqual([]);

    const { data: visibleNotes, error: visibleNotesError } = await mike
      .from("report_notes")
      .select("id")
      .eq("id", note!.id);
    expect(visibleNotesError).toBeNull();
    expect(visibleNotes).toEqual([]);
  });

  it("soft-deleting a report hides its report notes", async () => {
    const tempReportId = await insertReport(mike, projectId, MIKE.id);
    const { data: note, error: insertError } = await insertNote(mike, {
      reportId: tempReportId,
      projectId,
      authorId: MIKE.id,
      position: 16,
      body: "report delete child note",
    });
    expect(insertError).toBeNull();
    noteIds.push(note!.id);

    const { data: before, error: beforeError } = await sarah
      .from("report_notes")
      .select("id")
      .eq("report_id", tempReportId);
    expect(beforeError).toBeNull();
    expect(before).toEqual([{ id: note!.id }]);

    const { error: deleteReportError } = await mike.rpc(
      "soft_delete_report",
      { p_id: tempReportId },
    );
    expect(deleteReportError).toBeNull();

    const { data: after, error: afterError } = await sarah
      .from("report_notes")
      .select("id")
      .eq("report_id", tempReportId);
    expect(afterError).toBeNull();
    expect(after).toEqual([]);
  });

  it("soft-deleting a project removes member access to child rows", async () => {
    const tempProjectId = await createOwnedProject(mike, MIKE.id, "Vitest soft-deleted project");
    createdProjects.push(tempProjectId);
    const tempReportId = await insertReport(mike, tempProjectId, MIKE.id);
    await addMember(mike, tempProjectId, SARAH.id, "editor", MIKE.id);
    const fileId = await insertFile(mike, {
      projectId: tempProjectId,
      uploadedBy: MIKE.id,
      storagePath: `${tempProjectId}/voice/project-delete-${crypto.randomUUID()}.m4a`,
    });
    const { data: note, error: noteError } = await insertNote(mike, {
      reportId: tempReportId,
      projectId: tempProjectId,
      authorId: MIKE.id,
      position: 1,
      kind: "voice",
      body: null,
      fileId,
    });
    expect(noteError).toBeNull();

    const { data: beforeNotes } = await sarah
      .from("report_notes")
      .select("id")
      .eq("id", note!.id);
    expect(beforeNotes).toEqual([{ id: note!.id }]);

    const { error: deleteProjectError } = await mike.rpc(
      "soft_delete_project",
      { p_id: tempProjectId },
    );
    expect(deleteProjectError).toBeNull();

    const { data: reportsAfter, error: reportsAfterError } = await sarah
      .from("reports")
      .select("id")
      .eq("id", tempReportId);
    expect(reportsAfterError).toBeNull();
    expect(reportsAfter).toEqual([]);

    const { data: notesAfter, error: notesAfterError } = await sarah
      .from("report_notes")
      .select("id")
      .eq("id", note!.id);
    expect(notesAfterError).toBeNull();
    expect(notesAfter).toEqual([]);

    const { data: filesAfter, error: filesAfterError } = await sarah
      .from("file_metadata")
      .select("id")
      .eq("id", fileId);
    expect(filesAfterError).toBeNull();
    expect(filesAfter).toEqual([]);
  });

  it("allows deleting file metadata after linked notes are soft-deleted", async () => {
    const fileId = await insertFile(mike, {
      projectId,
      uploadedBy: MIKE.id,
      storagePath: `${projectId}/voice/delete-flow-${crypto.randomUUID()}.m4a`,
    });
    const { data: note, error: insertError } = await insertNote(mike, {
      reportId,
      projectId,
      authorId: MIKE.id,
      position: 11,
      kind: "voice",
      body: null,
      fileId,
    });
    expect(insertError).toBeNull();
    noteIds.push(note!.id);

    const { error: earlyDeleteError } = await mike
      .from("file_metadata")
      .delete()
      .eq("id", fileId);
    expect(earlyDeleteError).not.toBeNull();

    const { error: editorCascadeError } = await sarah.rpc(
      "soft_delete_report_notes_for_file",
      { p_file_id: fileId },
    );
    expect(editorCascadeError).not.toBeNull();
    expect(editorCascadeError?.code).toBe("42501");

    const { error: cascadeError } = await mike.rpc(
      "soft_delete_report_notes_for_file",
      { p_file_id: fileId },
    );
    expect(cascadeError).toBeNull();

    const { data: visibleNotes, error: visibleNotesError } = await mike
      .from("report_notes")
      .select("id")
      .eq("id", note!.id);
    expect(visibleNotesError).toBeNull();
    expect(visibleNotes).toEqual([]);

    const { data: visibleFiles, error: visibleFilesError } = await mike
      .from("file_metadata")
      .select("id")
      .eq("id", fileId);
    expect(visibleFilesError).toBeNull();
    expect(visibleFiles).toEqual([]);

    const { error: deleteError } = await mike
      .from("file_metadata")
      .delete()
      .eq("id", fileId);
    expect(deleteError).toBeNull();
  });

  it("file uploader cascade also tombstones the active file", async () => {
    const fileId = await insertFile(sarah, {
      projectId,
      uploadedBy: SARAH.id,
      storagePath: `${projectId}/voice/uploader-flow-${crypto.randomUUID()}.m4a`,
    });
    const { data: note, error: insertError } = await insertNote(mike, {
      reportId,
      projectId,
      authorId: MIKE.id,
      position: 12,
      kind: "voice",
      body: null,
      fileId,
    });
    expect(insertError).toBeNull();
    noteIds.push(note!.id);

    const { error: cascadeError } = await sarah.rpc(
      "soft_delete_report_notes_for_file",
      { p_file_id: fileId },
    );
    expect(cascadeError).toBeNull();

    const { data: visibleFiles, error: visibleFilesError } = await sarah
      .from("file_metadata")
      .select("id")
      .eq("id", fileId);
    expect(visibleFilesError).toBeNull();
    expect(visibleFiles).toEqual([]);

    const { data: visibleNotes, error: visibleNotesError } = await mike
      .from("report_notes")
      .select("id")
      .eq("id", note!.id);
    expect(visibleNotesError).toBeNull();
    expect(visibleNotes).toEqual([]);
  });

  it("revoked file uploader cannot cascade linked report notes", async () => {
    const unlinkedFileId = await insertFile(sarah, {
      projectId,
      uploadedBy: SARAH.id,
      storagePath: `${projectId}/voice/revoked-unlinked-${crypto.randomUUID()}.m4a`,
    });
    const fileId = await insertFile(sarah, {
      projectId,
      uploadedBy: SARAH.id,
      storagePath: `${projectId}/voice/revoked-uploader-${crypto.randomUUID()}.m4a`,
    });
    const { data: note, error: insertError } = await insertNote(mike, {
      reportId,
      projectId,
      authorId: MIKE.id,
      position: 13,
      kind: "voice",
      body: null,
      fileId,
    });
    expect(insertError).toBeNull();
    noteIds.push(note!.id);

    await mike
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);

    const { error: cascadeError } = await sarah.rpc(
      "soft_delete_report_notes_for_file",
      { p_file_id: fileId },
    );
    expect(cascadeError).not.toBeNull();
    expect(cascadeError?.code).toBe("42501");

    const { data: directDeleteData, error: directDeleteError } = await sarah
      .from("file_metadata")
      .delete()
      .eq("id", unlinkedFileId)
      .select("id");
    expect(directDeleteError).toBeNull();
    expect(directDeleteData).toEqual([]);

    const { data: visibleUnlinkedFiles, error: visibleUnlinkedFilesError } = await mike
      .from("file_metadata")
      .select("id")
      .eq("id", unlinkedFileId);
    expect(visibleUnlinkedFilesError).toBeNull();
    expect(visibleUnlinkedFiles).toEqual([{ id: unlinkedFileId }]);

    const { data: visibleFiles, error: visibleFilesError } = await mike
      .from("file_metadata")
      .select("id")
      .eq("id", fileId);
    expect(visibleFilesError).toBeNull();
    expect(visibleFiles).toEqual([{ id: fileId }]);

    const { data: visibleNotes, error: visibleNotesError } = await mike
      .from("report_notes")
      .select("id")
      .eq("id", note!.id);
    expect(visibleNotesError).toBeNull();
    expect(visibleNotes).toEqual([{ id: note!.id }]);

    await addMember(mike, projectId, SARAH.id, "editor", MIKE.id);
  });

  it("viewer uploader cannot update file metadata", async () => {
    const fileId = await insertFile(sarah, {
      projectId,
      uploadedBy: SARAH.id,
      storagePath: `${projectId}/voice/viewer-uploader-${crypto.randomUUID()}.m4a`,
    });

    const { error: downgradeError } = await mike
      .from("project_members")
      .update({ role: "viewer" })
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);
    expect(downgradeError).toBeNull();

    const { data: updateData, error: updateError } = await sarah
      .from("file_metadata")
      .update({ filename: "viewer-edit.m4a" })
      .eq("id", fileId)
      .select("id");
    expect(updateError).toBeNull();
    expect(updateData).toEqual([]);

    const { data: file, error: fileError } = await mike
      .from("file_metadata")
      .select("filename")
      .eq("id", fileId)
      .single();
    expect(fileError).toBeNull();
    expect(file!.filename).toBe("note.m4a");

    const { error: restoreError } = await mike
      .from("project_members")
      .update({ role: "editor" })
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);
    expect(restoreError).toBeNull();
  });

  it("legacy file soft-delete RPC cascades linked report notes", async () => {
    const fileId = await insertFile(mike, {
      projectId,
      uploadedBy: MIKE.id,
      storagePath: `${projectId}/voice/legacy-rpc-${crypto.randomUUID()}.m4a`,
    });
    const { data: note, error: insertError } = await insertNote(mike, {
      reportId,
      projectId,
      authorId: MIKE.id,
      position: 14,
      kind: "voice",
      body: null,
      fileId,
    });
    expect(insertError).toBeNull();
    noteIds.push(note!.id);

    const { error: softDeleteError } = await mike.rpc(
      "soft_delete_file_metadata",
      { p_id: fileId },
    );
    expect(softDeleteError).toBeNull();

    const { data: visibleFiles, error: visibleFilesError } = await mike
      .from("file_metadata")
      .select("id")
      .eq("id", fileId);
    expect(visibleFilesError).toBeNull();
    expect(visibleFiles).toEqual([]);

    const { data: visibleNotes, error: visibleNotesError } = await mike
      .from("report_notes")
      .select("id")
      .eq("id", note!.id);
    expect(visibleNotesError).toBeNull();
    expect(visibleNotes).toEqual([]);
  });

  // ---- DELETE ----

  it("author cannot directly hard-delete own note", async () => {
    const noteId = noteIds[1]!;
    const { data, error } = await sarah
      .from("report_notes")
      .delete()
      .eq("id", noteId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("project owner cannot directly hard-delete any note", async () => {
    const noteId = noteIds[0]!;
    const { data, error } = await mike
      .from("report_notes")
      .delete()
      .eq("id", noteId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // ---- viewer cannot insert ----

  it("viewer cannot insert notes", async () => {
    // Change sarah to viewer
    await mike
      .from("project_members")
      .update({ role: "viewer" })
      .eq("project_id", projectId)
      .eq("user_id", SARAH.id);

    const { error } = await insertNote(sarah, {
      reportId,
      projectId,
      authorId: SARAH.id,
      position: 10,
      body: "viewer attempt",
    });
    expect(error).not.toBeNull();
  });
});
