import { backend } from "@/lib/backend";

export type MemberRole = "admin" | "editor" | "viewer";

export type TeamMember = {
  member_id: string | null;
  user_id: string;
  role: MemberRole | "owner";
  full_name: string | null;
  company_name: string | null;
  is_owner: boolean;
  created_at: string;
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_OPTIONS: readonly MemberRole[] = ["admin", "editor", "viewer"] as const;

export async function fetchProjectTeam(projectId: string): Promise<TeamMember[]> {
  const { data, error } = await backend
    .rpc("get_project_team", { p_project_id: projectId });

  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

export async function addMemberByPhone(
  projectId: string,
  phone: string,
  role: MemberRole,
): Promise<void> {
  // Look up the profile id by phone via secure RPC
  const { data: profileId, error: lookupError } = await backend
    .rpc("lookup_profile_id_by_phone", { p_phone: phone.trim() });

  if (lookupError) throw lookupError;
  if (!profileId) {
    throw new Error("No user found with that phone number. They need to sign up for Haru first.");
  }

  const { data: session } = await backend.auth.getSession();
  const currentUserId = session?.session?.user?.id ?? null;

  const { error } = await backend
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: profileId,
      role,
      invited_by: currentUserId,
    });

  if (error) {
    if (error.code === "23505") {
      throw new Error("This user is already a member of this project.");
    }
    throw error;
  }
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await backend
    .from("project_members")
    .delete()
    .eq("id", memberId);

  if (error) throw error;
}

export async function updateMemberRole(
  memberId: string,
  role: MemberRole,
): Promise<void> {
  const { error } = await backend
    .from("project_members")
    .update({ role })
    .eq("id", memberId);

  if (error) throw error;
}
