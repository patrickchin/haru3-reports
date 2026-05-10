import { useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/infra/supabase";
import type { Database } from "@/infra/db-types";

type ProfileUpdate =
  Database["public"]["Tables"]["profiles"]["Update"];

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: ProfileUpdate) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useClearLocalCache() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Clear all React Query cache
      queryClient.clear();

      // Clear AsyncStorage non-auth keys
      const allKeys = await AsyncStorage.getAllKeys();
      const authKeys = [
        "supabase.auth.token",
        "supabase.auth.expires_at",
        "supabase.auth.refresh_token",
      ];
      const keysToRemove = allKeys.filter(
        (key) =>
          !authKeys.some((authKey) => key.includes(authKey))
      );
      await AsyncStorage.multiRemove(keysToRemove);

      // Refetch all active queries
      await queryClient.refetchQueries({ type: "active" });
    },
  });
}
