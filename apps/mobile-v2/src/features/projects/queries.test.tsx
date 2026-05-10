import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useProjects, useProject, useProjectMembers, projectKeys } from "./queries";
import { supabase } from "@/infra/supabase";

vi.mock("@/infra/supabase", () => ({
  supabase: {
    from: vi.fn(),
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

describe("projectKeys", () => {
  it("generates correct query keys", () => {
    expect(projectKeys.all).toEqual(["projects"]);
    expect(projectKeys.byId("abc")).toEqual(["projects", "id", "abc"]);
    expect(projectKeys.members("abc")).toEqual(["projects", "id", "abc", "members"]);
  });
});

describe("useProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches projects with roles", async () => {
    const mockProjects = [
      { id: "p1", name: "Project 1", owner_id: "u1", deleted_at: null },
    ];
    const mockMemberships = [{ project_id: "p1", role: "owner" }];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockMemberships, error: null }),
      } as any;
    });

    const { result } = renderHook(() => useProjects("u1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].role).toBe("owner");
  });

  it("filters deleted projects", async () => {
    const mockProjects = [
      { id: "p1", name: "Active", deleted_at: null },
      { id: "p2", name: "Deleted", deleted_at: "2026-01-01" },
    ];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockImplementation((col, val) => {
            const filtered = mockProjects.filter((p) => p.deleted_at === val);
            return {
              order: vi.fn().mockResolvedValue({ data: filtered, error: null }),
            };
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any;
    });

    const { result } = renderHook(() => useProjects("u1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe("Active");
  });
});

describe("useProject", () => {
  it("fetches single project by id", async () => {
    const mockProject = {
      id: "p1",
      name: "Test Project",
      deleted_at: null,
    };

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
    } as any);

    const { result } = renderHook(() => useProject("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Test Project");
  });
});

describe("useProjectMembers", () => {
  it("fetches members with profile join", async () => {
    const mockMembers = [
      {
        id: "m1",
        project_id: "p1",
        profile_id: "u1",
        role: "owner",
        profiles: { full_name: "Alice", company_name: "ACME", phone: "+1234" },
      },
    ];

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
    } as any);

    const { result } = renderHook(() => useProjectMembers("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].profile.full_name).toBe("Alice");
  });
});
