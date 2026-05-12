import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchProjectTeam, type TeamMember } from "@/lib/project-members";
import {
  capabilitiesForRole,
  type ProjectCapabilities,
  type ProjectRole,
} from "@/lib/project-permissions";

export const projectTeamKey = (projectId: string) =>
  ["project-team", projectId] as const;

export interface UseProjectRoleResult {
  /** The current user's effective role on this project, or `null` if loading
   *  / not a member / network error. Treat `null` as "no permissions yet". */
  role: ProjectRole | null;
  /** Permission flags derived from `role`. Defaults to all-false while
   *  loading so we never flash a write button at a viewer. */
  can: ProjectCapabilities;
  /** True while the underlying team query is in flight on first load. */
  isLoading: boolean;
}

/**
 * Resolve the current user's role on `projectId` and derive UI permission
 * flags. Backed by the same `["project-team", projectId]` query used by the
 * Members screen, so opening a project after viewing its members is free.
 *
 * Why "loading == zero permissions": showing a Delete button for 200 ms and
 * then yanking it away is worse UX than waiting for the role to resolve.
 * Buttons should appear once, in the right state.
 */
export function useProjectRole(
  projectId: string | null | undefined,
): UseProjectRoleResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const enabled = Boolean(projectId && userId);

  const { data: team, isLoading } = useQuery<TeamMember[]>({
    queryKey: projectId ? projectTeamKey(projectId) : ["project-team", "_disabled"],
    queryFn: () => fetchProjectTeam(projectId as string),
    enabled,
    // Membership rarely changes mid-session; keep it warm.
    staleTime: 60_000,
  });

  const role = useMemo<ProjectRole | null>(() => {
    if (!enabled || !team || !userId) return null;
    const me = team.find((m) => m.user_id === userId);
    if (!me) return null;
    if (me.is_owner || me.role === "owner") return "owner";
    return me.role as ProjectRole;
  }, [enabled, team, userId]);

  const can = useMemo(() => capabilitiesForRole(role), [role]);

  return { role, can, isLoading: enabled && isLoading };
}
