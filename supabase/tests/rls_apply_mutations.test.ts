/**
 * RLS integration tests for the local-first apply_*_mutation RPCs.
 *
 * These RPCs run as `SECURITY DEFINER` (so they can write the
 * client_ops idempotency row), but they enforce auth.uid() owner /
 * membership checks inside the function body. We verify:
 *  - INSERT/UPDATE/DELETE happy paths return status='applied'
 *  - duplicate client_op_id replays the cached response (status='duplicate')
 *  - stale base_version returns status='conflict' with the server row
 *  - non-owner gets status='forbidden' (never throws)
 *  - report editor membership grants update rights but not delete
 *  - bare unauthenticated call rejects (auth.uid() guard)
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  MIKE,
  SARAH,
  anonClient,
  cleanupProjects,
  createOwnedProject,
  signIn,
} from "./helpers";

const createdProjects: string[] = [];

afterAll(async () => {
  if (createdProjects.length === 0) return;
  const mike = await signIn(MIKE);
  await cleanupProjects(mike, createdProjects);
});

describe("apply_project_mutation", () => {
  it("insert+update+delete round-trip for the owner", async () => {
    const mike = await signIn(MIKE);
    const projectId = randomUUID();

    const ins = await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: projectId,
        fields: { name: "Site A", status: "active" },
      },
    });
    expect(ins.error).toBeNull();
    expect(ins.data.status).toBe("applied");
    expect(ins.data.row.name).toBe("Site A");
    expect(ins.data.row.owner_id).toBe(MIKE.id);
    createdProjects.push(projectId);
    const v1: string = ins.data.server_version;

    const upd = await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: projectId,
        base_version: v1,
        fields: { name: "Site A — renamed" },
      },
    });
    expect(upd.error).toBeNull();
    expect(upd.data.status).toBe("applied");
    expect(upd.data.row.name).toBe("Site A — renamed");
    const v2: string = upd.data.server_version;

    const del = await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "delete",
        id: projectId,
        base_version: v2,
      },
    });
    expect(del.error).toBeNull();
    expect(del.data.status).toBe("applied");
    expect(del.data.row.deleted_at).not.toBeNull();
  });

  it("duplicate client_op_id returns status='duplicate' with cached row", async () => {
    const mike = await signIn(MIKE);
    const projectId = randomUUID();
    const opId = randomUUID();

    const first = await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: opId,
        op: "insert",
        id: projectId,
        fields: { name: "Dup Test" },
      },
    });
    expect(first.data.status).toBe("applied");
    createdProjects.push(projectId);

    const second = await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: opId,
        op: "insert",
        id: projectId,
        fields: { name: "ignored on replay" },
      },
    });
    expect(second.data.status).toBe("duplicate");
    expect(second.data.row.name).toBe("Dup Test");
  });

  it("stale base_version returns status='conflict' with current server row", async () => {
    const mike = await signIn(MIKE);
    const projectId = randomUUID();
    await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: projectId,
        fields: { name: "Conflict source" },
      },
    });
    createdProjects.push(projectId);

    // Intervening update bumps updated_at.
    await mike
      .from("projects")
      .update({ name: "server-bumped" })
      .eq("id", projectId);

    const stale = await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: projectId,
        base_version: "1970-01-01T00:00:00.000Z",
        fields: { name: "client wants this" },
      },
    });
    expect(stale.data.status).toBe("conflict");
    expect(stale.data.row.name).toBe("server-bumped");
  });

  it("non-owner gets status='forbidden' on update", async () => {
    const mike = await signIn(MIKE);
    const projectId = randomUUID();
    await mike.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: projectId,
        fields: { name: "Mike's only" },
      },
    });
    createdProjects.push(projectId);

    const sarah = await signIn(SARAH);
    const res = await sarah.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: projectId,
        fields: { name: "stolen" },
      },
    });
    expect(res.data.status).toBe("forbidden");

    // And the row really wasn't changed.
    const { data: row } = await mike
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();
    expect(row!.name).toBe("Mike's only");
  });

  it("rejects unauthenticated callers", async () => {
    const anon = anonClient();
    const res = await anon.rpc("apply_project_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: randomUUID(),
        fields: { name: "anon" },
      },
    });
    // PostgREST surfaces the SQLSTATE 42501 RAISE as an error.
    expect(res.error).not.toBeNull();
  });
});

describe("apply_report_mutation", () => {
  it("insert+update round-trip for the owner", async () => {
    const mike = await signIn(MIKE);
    const projectId = await createOwnedProject(mike, MIKE.id);
    createdProjects.push(projectId);

    const reportId = randomUUID();
    const ins = await mike.rpc("apply_report_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: reportId,
        fields: {
          project_id: projectId,
          title: "Visit 1",
          report_type: "daily",
          status: "draft",
          report_data: { sections: [] },
        },
      },
    });
    expect(ins.error).toBeNull();
    expect(ins.data.status).toBe("applied");
    expect(ins.data.row.title).toBe("Visit 1");

    const upd = await mike.rpc("apply_report_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: reportId,
        base_version: ins.data.server_version,
        fields: { status: "final" },
      },
    });
    expect(upd.data.status).toBe("applied");
    expect(upd.data.row.status).toBe("final");
  });

  it("editor member can update but stranger cannot", async () => {
    const mike = await signIn(MIKE);
    const projectId = await createOwnedProject(mike, MIKE.id);
    createdProjects.push(projectId);

    // Add Sarah as editor.
    const { error: addErr } = await mike.from("project_members").insert({
      project_id: projectId,
      user_id: SARAH.id,
      role: "editor",
    });
    expect(addErr).toBeNull();

    const reportId = randomUUID();
    await mike.rpc("apply_report_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: reportId,
        fields: { project_id: projectId, title: "Shared", report_type: "daily" },
      },
    });

    const sarah = await signIn(SARAH);
    const sarahUpdate = await sarah.rpc("apply_report_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: reportId,
        fields: { status: "final" },
      },
    });
    expect(sarahUpdate.data.status).toBe("applied");
    expect(sarahUpdate.data.row.status).toBe("final");

    // But Sarah cannot delete (owner-only).
    const sarahDelete = await sarah.rpc("apply_report_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "delete",
        id: reportId,
      },
    });
    expect(sarahDelete.data.status).toBe("forbidden");
  });
});

describe("apply_file_metadata_mutation", () => {
  it("owner round-trips insert+update+delete", async () => {
    const mike = await signIn(MIKE);
    const projectId = await createOwnedProject(mike, MIKE.id, "Vitest fm apply");
    createdProjects.push(projectId);

    const fileId = randomUUID();
    const ins = await mike.rpc("apply_file_metadata_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: fileId,
        fields: {
          project_id: projectId,
          category: "voice-note",
          storage_path: `${projectId}/voice-notes/${fileId}.m4a`,
          filename: "note.m4a",
          mime_type: "audio/m4a",
          size_bytes: "2048",
          duration_ms: "12000",
        },
      },
    });
    expect(ins.error).toBeNull();
    expect(ins.data.status).toBe("applied");
    expect(ins.data.row.uploaded_by).toBe(MIKE.id);
    const v1 = ins.data.server_version;

    const upd = await mike.rpc("apply_file_metadata_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: fileId,
        base_version: v1,
        fields: { filename: "renamed.m4a" },
      },
    });
    expect(upd.data.status).toBe("applied");
    expect(upd.data.row.filename).toBe("renamed.m4a");

    const del = await mike.rpc("apply_file_metadata_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "delete",
        id: fileId,
        base_version: upd.data.server_version,
      },
    });
    expect(del.data.status).toBe("applied");
    expect(del.data.row.deleted_at).not.toBeNull();
  });

  it("idempotent replay returns cached duplicate response", async () => {
    const mike = await signIn(MIKE);
    const projectId = await createOwnedProject(mike, MIKE.id, "Vitest fm dup");
    createdProjects.push(projectId);

    const fileId = randomUUID();
    const opId = randomUUID();
    const payload = {
      client_op_id: opId,
      op: "insert",
      id: fileId,
      fields: {
        project_id: projectId,
        category: "document",
        storage_path: `${projectId}/documents/${fileId}.pdf`,
        filename: "x.pdf",
        mime_type: "application/pdf",
        size_bytes: "1024",
      },
    };
    const first = await mike.rpc("apply_file_metadata_mutation", { p_payload: payload });
    expect(first.data.status).toBe("applied");
    const second = await mike.rpc("apply_file_metadata_mutation", { p_payload: payload });
    expect(second.data.status).toBe("duplicate");
    expect(second.data.row.id).toBe(fileId);
  });

  it("non-member is forbidden", async () => {
    const mike = await signIn(MIKE);
    const projectId = await createOwnedProject(mike, MIKE.id, "Vitest fm forbid");
    createdProjects.push(projectId);

    const sarah = await signIn(SARAH);
    const res = await sarah.rpc("apply_file_metadata_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: randomUUID(),
        fields: {
          project_id: projectId,
          category: "document",
          storage_path: `${projectId}/documents/x.pdf`,
          filename: "x.pdf",
          mime_type: "application/pdf",
          size_bytes: "1024",
        },
      },
    });
    expect(res.data.status).toBe("forbidden");
  });

  it("stale base_version returns conflict with current server row", async () => {
    const mike = await signIn(MIKE);
    const projectId = await createOwnedProject(mike, MIKE.id, "Vitest fm conflict");
    createdProjects.push(projectId);

    const fileId = randomUUID();
    const ins = await mike.rpc("apply_file_metadata_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "insert",
        id: fileId,
        fields: {
          project_id: projectId,
          category: "voice-note",
          storage_path: `${projectId}/voice-notes/${fileId}.m4a`,
          filename: "note.m4a",
          mime_type: "audio/m4a",
          size_bytes: "2048",
        },
      },
    });
    const v1 = ins.data.server_version;

    await mike.rpc("apply_file_metadata_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: fileId,
        base_version: v1,
        fields: { filename: "first.m4a" },
      },
    });

    const stale = await mike.rpc("apply_file_metadata_mutation", {
      p_payload: {
        client_op_id: randomUUID(),
        op: "update",
        id: fileId,
        base_version: v1,
        fields: { filename: "second.m4a" },
      },
    });
    expect(stale.data.status).toBe("conflict");
    expect(stale.data.row.filename).toBe("first.m4a");
  });
});
