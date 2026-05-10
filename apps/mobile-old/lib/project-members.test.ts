import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const getSessionMock = vi.fn();
const insertMock = vi.fn();
const deleteMock = vi.fn();
const updateMock = vi.fn();

const eqInsert = vi.fn();
const eqDelete = vi.fn();
const eqUpdate = vi.fn();

vi.mock("@/lib/backend", () => ({
  backend: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
    from: vi.fn(() => ({
      insert: (...args: unknown[]) => insertMock(...args),
      delete: () => ({ eq: (...args: unknown[]) => eqDelete(...args) }),
      update: (...args: unknown[]) => {
        updateMock(...args);
        return { eq: (...args2: unknown[]) => eqUpdate(...args2) };
      },
    })),
  },
}));

beforeEach(() => {
  rpcMock.mockReset();
  getSessionMock.mockReset();
  insertMock.mockReset();
  eqInsert.mockReset();
  eqDelete.mockReset();
  eqUpdate.mockReset();
  updateMock.mockReset();
});

describe("ROLE_LABELS / ROLE_OPTIONS", () => {
  it("exposes labels for every role option", async () => {
    const mod = await import("./project-members");
    for (const role of mod.ROLE_OPTIONS) {
      expect(mod.ROLE_LABELS[role]).toBeTruthy();
    }
    expect(mod.ROLE_OPTIONS).toEqual(["admin", "editor", "viewer"]);
  });
});

describe("fetchProjectTeam", () => {
  it("returns the rpc data array", async () => {
    rpcMock.mockResolvedValue({ data: [{ user_id: "u1" }], error: null });
    const { fetchProjectTeam } = await import("./project-members");
    const result = await fetchProjectTeam("p1");
    expect(rpcMock).toHaveBeenCalledWith("get_project_team", { p_project_id: "p1" });
    expect(result).toEqual([{ user_id: "u1" }]);
  });

  it("returns [] when rpc returns null data", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { fetchProjectTeam } = await import("./project-members");
    expect(await fetchProjectTeam("p1")).toEqual([]);
  });

  it("throws when rpc errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "bad" } });
    const { fetchProjectTeam } = await import("./project-members");
    await expect(fetchProjectTeam("p1")).rejects.toEqual({ message: "bad" });
  });
});

describe("addMemberByPhone", () => {
  it("rejects an unparseable phone before any rpc call", async () => {
    const { addMemberByPhone } = await import("./project-members");
    await expect(addMemberByPhone("p1", "garbage", "editor")).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("throws a helpful error when no profile exists for the phone", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const { addMemberByPhone } = await import("./project-members");
    await expect(
      addMemberByPhone("p1", "+14155551234", "viewer"),
    ).rejects.toThrow(/no user found/i);
  });

  it("propagates lookup_profile_id_by_phone rpc errors", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "lookup boom" },
    });
    const { addMemberByPhone } = await import("./project-members");
    await expect(
      addMemberByPhone("p1", "+14155551234", "editor"),
    ).rejects.toEqual({ message: "lookup boom" });
  });

  it("inserts member with invited_by from current session", async () => {
    rpcMock.mockResolvedValueOnce({ data: "user-2", error: null });
    getSessionMock.mockResolvedValueOnce({
      data: { session: { user: { id: "user-1" } } },
    });
    insertMock.mockResolvedValueOnce({ error: null });
    const { addMemberByPhone } = await import("./project-members");
    await addMemberByPhone("proj-1", "+14155551234", "editor");
    expect(insertMock).toHaveBeenCalledWith({
      project_id: "proj-1",
      user_id: "user-2",
      role: "editor",
      invited_by: "user-1",
    });
  });

  it("inserts with invited_by null when there is no session", async () => {
    rpcMock.mockResolvedValueOnce({ data: "user-2", error: null });
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    insertMock.mockResolvedValueOnce({ error: null });
    const { addMemberByPhone } = await import("./project-members");
    await addMemberByPhone("proj-1", "+14155551234", "viewer");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ invited_by: null }),
    );
  });

  it("translates 23505 unique violation into a friendly error", async () => {
    rpcMock.mockResolvedValueOnce({ data: "user-2", error: null });
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    insertMock.mockResolvedValueOnce({
      error: { code: "23505", message: "duplicate" },
    });
    const { addMemberByPhone } = await import("./project-members");
    await expect(
      addMemberByPhone("p1", "+14155551234", "editor"),
    ).rejects.toThrow(/already a member/i);
  });

  it("rethrows non-23505 insert errors verbatim", async () => {
    const err = { code: "42501", message: "rls denied" };
    rpcMock.mockResolvedValueOnce({ data: "user-2", error: null });
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    insertMock.mockResolvedValueOnce({ error: err });
    const { addMemberByPhone } = await import("./project-members");
    await expect(
      addMemberByPhone("p1", "+14155551234", "editor"),
    ).rejects.toEqual(err);
  });
});

describe("removeMember", () => {
  it("issues a delete keyed by member id", async () => {
    eqDelete.mockResolvedValueOnce({ error: null });
    const { removeMember } = await import("./project-members");
    await removeMember("m-1");
    expect(eqDelete).toHaveBeenCalledWith("id", "m-1");
  });

  it("propagates delete errors", async () => {
    eqDelete.mockResolvedValueOnce({ error: { message: "nope" } });
    const { removeMember } = await import("./project-members");
    await expect(removeMember("m-1")).rejects.toEqual({ message: "nope" });
  });
});

describe("updateMemberRole", () => {
  it("updates the role for the member id", async () => {
    eqUpdate.mockResolvedValueOnce({ error: null });
    const { updateMemberRole } = await import("./project-members");
    await updateMemberRole("m-1", "admin");
    expect(updateMock).toHaveBeenCalledWith({ role: "admin" });
    expect(eqUpdate).toHaveBeenCalledWith("id", "m-1");
  });

  it("propagates update errors", async () => {
    eqUpdate.mockResolvedValueOnce({ error: { message: "x" } });
    const { updateMemberRole } = await import("./project-members");
    await expect(updateMemberRole("m-1", "viewer")).rejects.toEqual({
      message: "x",
    });
  });
});
