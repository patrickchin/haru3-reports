import { backend } from "@/lib/backend";

export type MemberRole = "admin" | "editor" | "viewer";

export type ProjectMember = {
  id: string;
  project_id: string;
  user_id: string;
  role: MemberRole;
  invited_by: string | null;
  created_at: string;
  profile: {
    full_name: string | null;
    phone: string;
    company_name: string | null;
  };
};

export type ProjectOwner = {
  id: string;
  full_name: string | null;
  phone: string;
  company_name: string | null;
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_OPTIONS: readonly MemberRole[] = ["admin", "editor", "viewer"] as const;

export async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await backend
    .from("project_members")
    .select("id, project_id, user_id, role, invited_by, created_at, profile:profiles(full_name, phone, company_name)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as ProjectMember[];
}

export async function fetchProjectOwner(projectId: string): Promise<ProjectOwner> {
  const { data, error } = await backend
    .from("projects")
    .select("owner:profiles!projects_owner_id_fkey(id, full_name, phone, company_name)")
    .eq("id", projectId)
    .single();

  if (error) throw error;
  const owner = (data as unknown as { owner: ProjectOwner }).owner;
  return owner;
}

export async function addMemberByPhone(
  projectId: string,
  phone: string,
  role: MemberRole,
): Promise<ProjectMember> {
  // Look up the profile by phone number
  const { data: profile, error: lookupError } = await backend
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!profile) {
    throw new Error("No user found with that phone number. They need to sign up for Haru first.");
  }

  const { data: session } = await backend.auth.getSession();
  const currentUserId = session?.session?.user?.id ?? null;

  const { data, error } = await backend
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: profile.id,
      role,
      invited_by: currentUserId,
    })
    .select("id, project_id, user_id, role, invited_by, created_at, profile:profiles(full_name, phone, company_name)")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("This user is already a member of this project.");
    }
    throw error;
  }

  return data as unknown as ProjectMember;
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
