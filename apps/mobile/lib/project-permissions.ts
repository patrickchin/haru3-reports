import type { MemberRole } from "@/lib/project-members";

/**
 * Effective project role for the current user. `null` means "no role yet"
 * (loading or non-member); we treat this as zero permissions on purpose so
 * write affordances stay hidden until we positively confirm access.
 *
 * Mirrors the DB enum used by `public.user_project_role(...)`:
 *   owner | admin | editor | viewer
 */
export type ProjectRole = "owner" | MemberRole;

/**
 * Permission matrix — single source of truth for *what UI we show*. The DB
 * RLS policies are the actual enforcement layer; this matrix exists so the
 * mobile app doesn't surface buttons that would just bounce off RLS with a
 * confusing error toast.
 *
 * Keep this in lockstep with the policies in
 * `supabase/migrations/202604210001_project_members.sql` and the
 * `soft_delete_*` RPCs.
 */
export interface ProjectCapabilities {
  /** View the project tile / member list / reports list. */
  viewProject: boolean;
  /** Edit project profile fields (name, address, client, status). */
  editProject: boolean;
  /** Soft-delete the project. Owner only. */
  deleteProject: boolean;
  /** Add / remove members and change member roles. */
  manageMembers: boolean;
  /**
   * Create reports, add notes/photos/voice, regenerate, finalize, and
   * unfinalize. Mirrors `reports` INSERT/UPDATE policies which require
   * owner / admin / editor.
   */
  writeReport: boolean;
  /** Soft-delete a report. Owner / admin only (delete is destructive). */
  deleteReport: boolean;
}

const NO_ACCESS: ProjectCapabilities = {
  viewProject: false,
  editProject: false,
  deleteProject: false,
  manageMembers: false,
  writeReport: false,
  deleteReport: false,
};

/**
 * Pure function: role → capabilities. Exported for tests and for any caller
 * that already knows the role (e.g. the members screen).
 */
export function capabilitiesForRole(
  role: ProjectRole | null | undefined,
): ProjectCapabilities {
  switch (role) {
    case "owner":
      return {
        viewProject: true,
        editProject: true,
        deleteProject: true,
        manageMembers: true,
        writeReport: true,
        deleteReport: true,
      };
    case "admin":
      return {
        viewProject: true,
        editProject: false,
        deleteProject: false,
        manageMembers: true,
        writeReport: true,
        deleteReport: true,
      };
    case "editor":
      return {
        viewProject: true,
        editProject: false,
        deleteProject: false,
        manageMembers: false,
        writeReport: true,
        deleteReport: false,
      };
    case "viewer":
      return {
        viewProject: true,
        editProject: false,
        deleteProject: false,
        manageMembers: false,
        writeReport: false,
        deleteReport: false,
      };
    default:
      return NO_ACCESS;
  }
}
