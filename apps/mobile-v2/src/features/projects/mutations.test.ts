import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateProject,
  useUpdateProject,
  useSoftDeleteProject,
  useAddMember,
  useUpdateMemberRole,
  useRemoveMember,
} from "./mutations";
import { supabase } from "@/infra/supabase";

vi.mock("@/infra/supabase", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useCreateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates project and returns id", async () => {
    const mockInsert = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: "new-id" }, error: null });

    vi.mocked(supabase.from).mockReturnValue({
      insert: mockInsert,
      select: mockSelect,
      single: mockSingle,
    } as any);

    const { result } = renderHook(() => useCreateProject("owner-id"), {
      wrapper: createWrapper(),
    });

    const mutation = result.current.mutateAsync({
      name: "New Project",
      address: "123 Main St",
    });

    await waitFor(() => expect(mutation).resolves.toEqual({ id: "new-id" }));

    expect(mockInsert).toHaveBeenCalledWith({
      name: "New Project",
      address: "123 Main St",
      owner_id: "owner-id",
    });
  });

  it("invalidates projects query on success", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "x" }, error: null }),
    } as any);

    const { result } = renderHook(() => useCreateProject("u1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({ name: "Test" });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["projects"],
    });
  });
});

describe("useUpdateProject", () => {
  it("updates project fields", async () => {
    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
    } as any);

    const { result } = renderHook(() => useUpdateProject("project-id"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ name: "Updated Name" });

    expect(mockUpdate).toHaveBeenCalledWith({ name: "Updated Name" });
    expect(mockEq).toHaveBeenCalledWith("id", "project-id");
  });
});

describe("useSoftDeleteProject", () => {
  it("calls soft_delete_project RPC", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.rpc).mockImplementation(mockRpc);

    const { result } = renderHook(() => useSoftDeleteProject(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync("project-id");

    expect(mockRpc).toHaveBeenCalledWith("soft_delete_project", {
      p_id: "project-id",
    });
  });
});

describe("useAddMember", () => {
  it("looks up profile by phone and inserts member", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: "user-id", error: null });
    vi.mocked(supabase.rpc).mockImplementation(mockRpc);

    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({
      insert: mockInsert,
    } as any);

    const { result } = renderHook(() => useAddMember("project-id"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      phone: "+1234567890",
      role: "viewer",
    });

    expect(mockRpc).toHaveBeenCalledWith("lookup_profile_id_by_phone", {
      p_phone: "+1234567890",
    });

    expect(mockInsert).toHaveBeenCalledWith({
      project_id: "project-id",
      profile_id: "user-id",
      role: "viewer",
    });
  });

  it("throws error if user not found", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAddMember("project-id"), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ phone: "+1234567890", role: "viewer" })
    ).rejects.toThrow("No user found");
  });
});

describe("useUpdateMemberRole", () => {
  it("updates member role", async () => {
    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
    } as any);

    const { result } = renderHook(() => useUpdateMemberRole(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      memberId: "m1",
      projectId: "p1",
      role: "uploader",
    });

    expect(mockUpdate).toHaveBeenCalledWith({ role: "uploader" });
    expect(mockEq).toHaveBeenCalledWith("id", "m1");
  });
});

describe("useRemoveMember", () => {
  it("deletes member", async () => {
    const mockDelete = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockReturnValue({
      delete: mockDelete,
      eq: mockEq,
    } as any);

    const { result } = renderHook(() => useRemoveMember(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ memberId: "m1", projectId: "p1" });

    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("id", "m1");
  });
});
