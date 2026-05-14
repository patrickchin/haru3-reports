import { useQuery } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

export interface MonthlyUsage {
  month: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  generation_count: number;
}

export function useTokenUsage() {
  const { user } = useAuth();

  return useQuery<MonthlyUsage | null>({
    queryKey: ["token-usage-monthly", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await backend
        .from("token_usage_monthly")
        .select("*")
        .eq("user_id", user!.id)
        .gte("month", monthStart)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
  });
}
