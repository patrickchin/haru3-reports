import { useQuery } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

export interface MonthlyUsageRow {
  month: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  generation_count: number;
}

export interface UsageEventRow {
  id: string;
  created_at: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  model: string;
  provider: string;
  project_id: string | null;
}

/** Fetch up to 12 months of aggregated usage history. */
export function useTokenUsageHistory() {
  const { user } = useAuth();

  return useQuery<MonthlyUsageRow[]>({
    queryKey: ["token-usage-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
      twelveMonthsAgo.setDate(1);
      const since = twelveMonthsAgo.toISOString();

      const { data, error } = await backend
        .from("token_usage_monthly")
        .select("*")
        .eq("user_id", user!.id)
        .gte("month", since)
        .order("month", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Fetch individual generation events for a given month. */
export function useTokenUsageEvents(monthIso: string | null) {
  const { user } = useAuth();

  return useQuery<UsageEventRow[]>({
    queryKey: ["token-usage-events", user?.id, monthIso],
    enabled: !!user && !!monthIso,
    queryFn: async () => {
      const start = new Date(monthIso!);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

      const { data, error } = await backend
        .from("token_usage")
        .select("id, created_at, input_tokens, output_tokens, cached_tokens, model, provider, project_id")
        .eq("user_id", user!.id)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
