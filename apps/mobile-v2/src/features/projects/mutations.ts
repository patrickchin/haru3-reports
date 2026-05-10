import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/infra/supabase";
import { projectKeys } from "./queries";

export type CreateProjectInput = {
  name: string;
  address?: string | null;
  clientName?: string | null;
};

export function useCreateProject(ownerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: input.name,
          address: input.address ?? null,
          client_name: input.clientName ?? null,
          owner_id: ownerId,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export type UpdateProjectInput = {
  name?: string;
  address?: string | null;
  clientName?: string | null;
};

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateProjectInput) => {
      const updateData: Record<string, any> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.address !== undefined) updateData.address = input.address;
      if (input.clientName !== undefined) updateData.client_name = input.clientName;

      const { error } = await supabase
        .from("projects")
        .update(updateData)
        .eq("id", projectId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.byId(projectId) });
    },
  });
}

export function useSoftDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.rpc("soft_delete_project", {
        p_id: projectId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export type AddMemberInput = {
  phone: string;
  role: "editor" | "viewer";
};

export function useAddMember(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddMemberInput) => {
      // Look up profile by phone
      const { data: profileId, error: lookupError } = await supabase.rpc(
        "lookup_profile_id_by_phone",
        { p_phone: input.phone }
      );

      if (lookupError) throw lookupError;
      if (!profileId) {
        throw new Error(
          "No user found with that phone number. They need to sign up first."
        );
      }

      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: profileId,
        role: input.role,
      });

      if (error) {
        if (error.code === "23505") {
          throw new Error("This user is already a member of this project.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
      queryClient.invalidateQueries({ queryKey: projectKeys.byId(projectId) });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      memberId: string;
      projectId: string;
      role: "editor" | "viewer";
    }) => {
      const { error } = await supabase
        .from("project_members")
        .update({ role: args.role })
        .eq("id", args.memberId);

      if (error) throw error;
      return args.projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { memberId: string; projectId: string }) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("id", args.memberId);

      if (error) throw error;
      return args.projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
    },
  });
}
