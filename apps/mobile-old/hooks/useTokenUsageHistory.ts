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

export interface ModelUsageRow {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  generation_count: number;
}

/** Fetch all events and aggregate by model + provider. */
export function useTokenUsageByModel() {
  const { user } = useAuth();

  return useQuery<ModelUsageRow[]>({
    queryKey: ["token-usage-by-model", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await backend
        .from("token_usage")
        .select("model, provider, input_tokens, output_tokens, cached_tokens")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data?.length) return [];

      const map = new Map<string, ModelUsageRow>();
      for (const row of data) {
        const key = `${row.provider}::${row.model}`;
        const existing = map.get(key);
        if (existing) {
          map.set(key, {
            ...existing,
            input_tokens: existing.input_tokens + row.input_tokens,
            output_tokens: existing.output_tokens + row.output_tokens,
            cached_tokens: existing.cached_tokens + row.cached_tokens,
            generation_count: existing.generation_count + 1,
          });
        } else {
          map.set(key, {
            model: row.model,
            provider: row.provider,
            input_tokens: row.input_tokens,
            output_tokens: row.output_tokens,
            cached_tokens: row.cached_tokens,
            generation_count: 1,
          });
        }
      }

      return [...map.values()].sort(
        (a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens),
      );
    },
  });
}
