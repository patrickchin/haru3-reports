/**
 * Subscription / entitlement state for the mobile client.
 *
 * Two sources of truth, used together:
 *   1. **Server** (`public.user_entitlements`) — authoritative quota,
 *      remaining counts, plan_id. Always queried over Supabase.
 *   2. **RevenueCat SDK** — instantly-available cached entitlements that
 *      survive offline. Lets us gate UI immediately on app launch without
 *      a network round-trip.
 *
 * We treat the server response as authoritative for quota math and the
 * RC cache as the optimistic UX layer. If they disagree (e.g. the user
 * just purchased and the webhook hasn't fired yet) we still show the
 * paywall as resolved because RC has confirmed entitlement, but quota
 * limits are enforced server-side in the edge function.
 */
import { useQuery } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

export type PlanId = "free" | "pro" | "team";

export interface ServerEntitlement {
  user_id: string;
  plan_id: PlanId;
  plan_name: string;
  subscription_status: string;
  max_projects: number | null;
  max_reports_mo: number;
  max_tokens_mo: number;
  allowed_providers: string[];
  default_provider: string | null;
  allowed_report_types: string[];
  reports_used_mo: number;
  tokens_used_mo: number;
  reports_remaining_mo: number;
  tokens_remaining_mo: number;
  current_period_end: string | null;
}

export interface EntitlementValue {
  loading: boolean;
  error: Error | null;
  /** Authoritative entitlement snapshot from Supabase. */
  server: ServerEntitlement | null;
  planId: PlanId;
  isPro: boolean;
  isTeam: boolean;
  isProOrAbove: boolean;
  /** True once we've successfully loaded server state at least once. */
  resolved: boolean;
  refetch: () => Promise<unknown>;
}

const FREE_PLAN: PlanId = "free";

export function useEntitlement(): EntitlementValue {
  const { user } = useAuth();

  const query = useQuery<ServerEntitlement | null>({
    queryKey: ["entitlement", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await backend
        .from("user_entitlements")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle<ServerEntitlement>();
      if (error) throw error;
      return data ?? null;
    },
  });

  const server = query.data ?? null;
  const planId: PlanId = (server?.plan_id as PlanId) ?? FREE_PLAN;

  return {
    loading: query.isLoading,
    error: query.error as Error | null,
    server,
    planId,
    isPro: planId === "pro",
    isTeam: planId === "team",
    isProOrAbove: planId === "pro" || planId === "team",
    resolved: query.isSuccess,
    refetch: query.refetch,
  };
}

/**
 * Local-only helper for "can the user pick this provider in the UI?"
 * The edge function will still soft-downgrade on the server, but we
 * want to grey out disallowed options up-front.
 */
export function isProviderAllowed(
  ent: ServerEntitlement | null,
  provider: string,
): boolean {
  if (!ent) return true; // optimistic until loaded
  if (ent.allowed_providers.length === 0) return true;
  return ent.allowed_providers.includes(provider);
}

export function isReportTypeAllowed(
  ent: ServerEntitlement | null,
  reportType: string,
): boolean {
  if (!ent) return true;
  if (ent.allowed_report_types.length === 0) return true;
  return ent.allowed_report_types.includes(reportType);
}
