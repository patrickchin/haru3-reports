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
    })
    .select("id, body, kind, position, author_id")
    .single();
}

describe("RLS — report_notes", () => {
  let mike: SupabaseClient;
  let sarah: SupabaseClient;
  let projectId: string;
  let reportId: string;
  const noteIds: string[] = [];

  beforeAll(async () => {
    mike = await signIn(MIKE);
    sarah = await signIn(SARAH);
    projectId = await createOwnedProject(mike, MIKE.id);
    reportId = await insertReport(mike, projectId, MIKE.id);
  });

  afterAll(async () => {
    // Cascade: deleting the project removes reports → report_notes
    await cleanupProjects(mike, [projectId]);
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
    await addMember(mike, projectId, SARAH.id, "editor", MIKE.id);
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

  // ---- DELETE ----

  it("author can delete own note", async () => {
    const noteId = noteIds[1]!;
    const { error } = await sarah
      .from("report_notes")
      .delete()
      .eq("id", noteId);
    expect(error).toBeNull();
  });

  it("project owner can delete any note", async () => {
    const noteId = noteIds[0]!;
    const { error } = await mike
      .from("report_notes")
      .delete()
      .eq("id", noteId);
    expect(error).toBeNull();
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
