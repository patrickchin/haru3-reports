/**
 * Project hooks (REST-backed via supabase-js).
 *
 * Names retain the `useLocal*` prefix to minimise churn in callers
 * during the offline-mode v1 removal. The "local-first" SQLite +
 * outbox path was removed in the offline-removal PR; everything now
 * goes straight to PostgREST. v2 (if it lands) is expected to pick
 * fresh names so we won't be tempted to re-introduce the dual path.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { backend } from "@/lib/backend";

const PROJECTS_KEY = ["projects"] as const;
function projectKey(projectId: string | undefined | null) {
  return ["project", projectId ?? null] as const;
}

export type ListedProject = {
  id: string;
  name: string;
  address: string | null;
  updated_at: string;
  owner_id: string;
  role: string;
};

export function useLocalProjects(ownerId: string | undefined | null) {
  const queryKey = [...PROJECTS_KEY, ownerId] as const;

  const projectsQuery = useQuery<ListedProject[]>({
    queryKey,
    enabled: !!ownerId,
    queryFn: async (): Promise<ListedProject[]> => {
      if (!ownerId) return [];
      const [projectsRes, membershipsRes] = await Promise.all([
        backend
          .from("projects")
          .select("id, name, address, updated_at, owner_id")
          .order("updated_at", { ascending: false }),
        backend
          .from("project_members")
          .select("project_id, role")
          .eq("user_id", ownerId),
      ]);
      if (projectsRes.error) throw projectsRes.error;
      if (membershipsRes.error) throw membershipsRes.error;
      const roleByProject = new Map<string, string>(
        (membershipsRes.data ?? []).map((m) => [m.project_id, m.role]),
      );
      return (projectsRes.data ?? []).map((p) => ({
        ...p,
        role:
          p.owner_id === ownerId
            ? "owner"
            : roleByProject.get(p.id) ?? "viewer",
      }));
    },
  });

  // Preserved for caller compatibility. The local-first first-sign-in
  // pull skeleton no longer exists, so this is always false post-removal.
  return { ...projectsQuery, isLoadingInitialProjects: false };
}

export type ProjectDetail = {
  id: string;
  name: string;
  address: string | null;
  client_name: string | null;
};

export function useLocalProject(projectId: string | undefined | null) {
  return useQuery<ProjectDetail | null>({
    queryKey: projectKey(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectDetail | null> => {
      if (!projectId) return null;
      const { data, error } = await backend
        .from("projects")
        .select("id, name, address, client_name")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data as ProjectDetail;
    },
  });
}

export type CreateProjectArgs = {
  name: string;
  address?: string | null;
  clientName?: string | null;
};

export type UpdateProjectFields = Partial<{
  name: string;
  address: string | null;
  client_name: string | null;
}>;

export function useLocalProjectMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const create = useMutation({
    mutationFn: async (input: CreateProjectArgs): Promise<{ id: string }> => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await backend
        .from("projects")
        .insert({
          name: input.name,
          address: input.address ?? null,
          client_name: input.clientName ?? null,
          owner_id: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; fields: UpdateProjectFields }) => {
      const { error } = await backend
        .from("projects")
        .update(args.fields)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      queryClient.invalidateQueries({ queryKey: projectKey(args.id) });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete is routed through a SECURITY DEFINER RPC. A direct
      // `update({deleted_at})` against `projects` fails RLS (42501)
      // because the post-update row no longer satisfies the SELECT
      // policy `deleted_at IS NULL`; the RPC bypasses RLS and enforces
      // ownership in SQL.
      const { error } = await backend.rpc("soft_delete_project", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });

  return { create, update, remove };
}
