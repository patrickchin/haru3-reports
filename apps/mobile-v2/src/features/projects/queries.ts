import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/infra/supabase";
import type { Project, ProjectMember, Profile } from "@/infra/db-types";

export const projectKeys = {
  all: ["projects"] as const,
  byId: (id: string) => [...projectKeys.all, "id", id] as const,
  members: (id: string) => [...projectKeys.byId(id), "members"] as const,
};

export type ProjectWithRole = Project & { role: string };

export function useProjects(userId: string | null) {
  return useQuery({
    queryKey: [...projectKeys.all, userId],
    enabled: !!userId,
    queryFn: async (): Promise<ProjectWithRole[]> => {
      if (!userId) return [];

      const [projectsRes, membershipsRes] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
        supabase
          .from("project_members")
          .select("project_id, role")
          .eq("user_id", userId),
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (membershipsRes.error) throw membershipsRes.error;

      const roleByProject = new Map<string, string>(
        (membershipsRes.data ?? []).map((m) => [m.project_id, m.role])
      );

      return (projectsRes.data ?? []).map((p) => ({
        ...p,
        role: p.owner_id === userId ? "owner" : roleByProject.get(p.id) ?? "viewer",
      }));
    },
  });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.byId(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<Project | null> => {
      if (!projectId) return null;

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .is("deleted_at", null)
        .single();

      if (error) throw error;
      return data;
    },
  });
}

export type MemberWithProfile = {
  id: string;
  project_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  profile: {
    full_name: string | null;
    company_name: string | null;
    phone: string;
  };
};

export function useProjectMembers(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.members(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<MemberWithProfile[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from("project_members")
        .select(
          `
          id,
          project_id,
          user_id,
          role,
          created_at,
          profiles (
            full_name,
            company_name,
            phone
          )
        `
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((m) => ({
        id: m.id,
        project_id: m.project_id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        profile: Array.isArray(m.profiles)
          ? m.profiles[0]
          : (m.profiles as any),
      }));
    },
  });
}
