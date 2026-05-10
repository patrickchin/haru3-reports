import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/infra/supabase";
import type { TokenUsage, TokenUsageMonthly } from "@/infra/db-types";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export function useTokenUsage() {
  return useQuery({
    queryKey: ["token-usage", "monthly"],
    queryFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return null;

      const now = new Date();
      const currentMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      ).toISOString();

      const { data, error } = await supabase
        .from("token_usage_monthly")
        .select("*")
        .eq("user_id", user.id)
        .eq("month", currentMonth)
        .maybeSingle<TokenUsageMonthly>();

      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export function useTokenUsageEvents(days: number = 30) {
  return useQuery({
    queryKey: ["token-usage", "events", days],
    queryFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return [];

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const { data, error } = await supabase
        .from("token_usage")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .returns<TokenUsage[]>();

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useTokenUsageHistory() {
  return useQuery({
    queryKey: ["token-usage", "history"],
    queryFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return [];

      const { data, error } = await supabase
        .from("token_usage_monthly")
        .select("*")
        .eq("user_id", user.id)
        .order("month", { ascending: false })
        .returns<TokenUsageMonthly[]>();

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}
