/**
 * Local-first hooks for projects.
 *
 * Each hook takes one of two paths based on whether SyncProvider has a
 * local DB ready (i.e. `EXPO_PUBLIC_LOCAL_FIRST` is on AND the user is
 * authenticated AND the DB opened cleanly):
 *
 *   - **Local-first**: read from SQLite via repos, write through repos
 *     (which enqueue outbox rows), then call `triggerPush()` to drain.
 *   - **Cloud fallback**: behave exactly as the screens did before — call
 *     `backend.from(...)` directly so behavior is unchanged when the flag
 *     is off.
 *
 * Cache invalidation: hooks subscribe to `onPushComplete` and invalidate
 * matching React Query keys whenever the engine reports applied rows.
 */
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { useSyncDb } from "@/lib/sync/SyncProvider";
import {
  createProject as createProjectLocal,
  softDeleteProject as deleteProjectLocal,
  getProject as getProjectLocal,
  listAccessibleProjects,
  listMemberRoles,
  updateProject as updateProjectLocal,
  type ProjectRow,
  type UpdateProjectFields,
} from "@/lib/local-db/repositories/projects-repo";

export const PROJECTS_KEY = ["projects"] as const;
export function projectKey(projectId: string | undefined | null) {
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
  const queryClient = useQueryClient();
  const { db, onPushComplete, onPullComplete, triggerPull } = useSyncDb();
  const isLocalFirst = db !== null;
  const queryKey = useMemo(
    () => [...PROJECTS_KEY, ownerId, isLocalFirst] as const,
    [ownerId, isLocalFirst],
  );
  const initialPullAttemptKeyRef = useRef<string | null>(null);
  const initialPullKey = ownerId && isLocalFirst ? `${ownerId}:local` : null;

  useEffect(() => {
    if (!isLocalFirst) return;
    return onPushComplete(() => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    });
  }, [isLocalFirst, onPushComplete, queryClient]);

  // Invalidate when a pull applies new rows for projects or memberships
  // so first sign-in (empty local cache) reflects server-side data
  // without needing a manual refresh or a local mutation to kick the
  // push-complete listener.
  useEffect(() => {
    if (!isLocalFirst) return;
    return onPullComplete((evt) => {
      if (
        evt.tablesApplied.includes("projects") ||
        evt.tablesApplied.includes("project_members")
      ) {
        queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      }
    });
  }, [isLocalFirst, onPullComplete, queryClient]);

  const projectsQuery = useQuery<ListedProject[]>({
    queryKey,
    enabled: !!ownerId,
    queryFn: async (): Promise<ListedProject[]> => {
      if (!ownerId) return [];
      if (isLocalFirst && db) {
        const [rows, roles] = await Promise.all([
          listAccessibleProjects(db),
          listMemberRoles(db, ownerId),
        ]);
        return rows.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          updated_at: p.updated_at,
          owner_id: p.owner_id,
          role: p.owner_id === ownerId ? "owner" : roles.get(p.id) ?? "viewer",
        }));
      }
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
  const projectsCount = projectsQuery.data?.length ?? null;

  useEffect(() => {
    if (
      !db ||
      !initialPullKey ||
      !projectsQuery.isSuccess ||
      initialPullAttemptKeyRef.current === initialPullKey
    ) {
      return;
    }

    initialPullAttemptKeyRef.current = initialPullKey;

    if (projectsCount === null || projectsCount > 0) {
      return;
    }

    let isActive = true;
    void Promise.resolve()
      .then(() => triggerPull())
      .finally(() => {
        if (isActive) {
          queryClient.invalidateQueries({ queryKey });
        }
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, [
    db,
    initialPullKey,
    projectsQuery.isSuccess,
    projectsCount,
    queryClient,
    queryKey,
    triggerPull,
  ]);

  return projectsQuery;
}

export type ProjectDetail = Pick<
  ProjectRow,
  "id" | "name" | "address" | "client_name"
>;

export function useLocalProject(projectId: string | undefined | null) {
  const queryClient = useQueryClient();
  const { db, onPushComplete, onPullComplete } = useSyncDb();
  const isLocalFirst = db !== null;

  useEffect(() => {
    if (!isLocalFirst || !projectId) return;
    return onPushComplete(() => {
      queryClient.invalidateQueries({ queryKey: projectKey(projectId) });
    });
  }, [isLocalFirst, onPushComplete, projectId, queryClient]);

  useEffect(() => {
    if (!isLocalFirst || !projectId) return;
    return onPullComplete((evt) => {
      if (evt.tablesApplied.includes("projects")) {
        queryClient.invalidateQueries({ queryKey: projectKey(projectId) });
      }
    });
  }, [isLocalFirst, onPullComplete, projectId, queryClient]);

  return useQuery<ProjectDetail | null>({
    queryKey: [...projectKey(projectId), isLocalFirst] as const,
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectDetail | null> => {
      if (!projectId) return null;
      if (isLocalFirst && db) {
        const row = await getProjectLocal(db, projectId);
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          address: row.address,
          client_name: row.client_name,
        };
      }
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

export function useLocalProjectMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { db, clock, newId, triggerPush } = useSyncDb();
  const isLocalFirst = db !== null;

  const create = useMutation({
    mutationFn: async (input: CreateProjectArgs): Promise<{ id: string }> => {
      if (!user?.id) throw new Error("Not authenticated");
      if (isLocalFirst && db) {
        const row = await createProjectLocal(
          { db, clock, newId },
          {
            ownerId: user.id,
            name: input.name,
            address: input.address ?? null,
            clientName: input.clientName ?? null,
          },
        );
        triggerPush();
        return { id: row.id };
      }
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
    mutationFn: async (args: {
      id: string;
      fields: UpdateProjectFields;
    }) => {
      if (isLocalFirst && db) {
        await updateProjectLocal({ db, clock, newId }, args.id, args.fields);
        triggerPush();
        return;
      }
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
      if (isLocalFirst && db) {
        await deleteProjectLocal({ db, clock, newId }, id);
        triggerPush();
        return;
      }
      const { error } = await backend.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });

  return { create, update, remove };
}
