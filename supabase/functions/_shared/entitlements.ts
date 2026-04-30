/**
 * Entitlement check shared module.
 *
 * Used by edge functions (notably `generate-report`) to enforce per-plan
 * quotas before invoking expensive AI providers.
 *
 * Quota enforcement is server-side and authoritative; the mobile client
 * caches plan info via RevenueCat for UX (gating UI, paywalls) but the
 * source of truth lives in `public.user_entitlements`.
 *
 * See docs/features/01-payment-system-design.md §5.2 and §10.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type EntitlementReason =
  | "ok"
  | "report_limit"
  | "token_limit"
  | "provider_not_allowed"
  | "report_type_not_allowed"
  | "lookup_failed";

export interface EntitlementSnapshot {
  user_id: string;
  plan_id: string;
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
}

export interface EntitlementCheck {
  allowed: boolean;
  reason: EntitlementReason;
  snapshot: EntitlementSnapshot | null;
  /** Provider the request should actually use; downgraded to plan default if user requested one outside their allowed set. */
  effective_provider?: string;
}

export interface CheckEntitlementOptions {
  /** Provider the user requested. Will be downgraded to plan default if not allowed. */
  provider?: string;
  /** Report type the user requested. */
  reportType?: string;
  /** Soft estimate of tokens this call will consume; defaults to 5000. */
  estimatedTokens?: number;
}

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Look up the user's current plan + monthly usage and decide whether the
 * request should proceed.
 *
 * Failure modes (default: fail closed):
 *   - lookup failed              → allowed=false, reason='lookup_failed'
 *   - quota exhausted            → allowed=false, reason='report_limit'|'token_limit'
 *   - report type not in plan    → allowed=false, reason='report_type_not_allowed'
 *   - provider not in plan       → allowed=true, effective_provider=<plan default>
 */
export async function checkEntitlement(
  userId: string,
  opts: CheckEntitlementOptions = {},
  deps: { client?: SupabaseClient } = {},
): Promise<EntitlementCheck> {
  const client = deps.client ?? serviceClient();
  if (!client) {
    return { allowed: false, reason: "lookup_failed", snapshot: null };
  }

  const { data, error } = await client
    .from("user_entitlements")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    console.error(
      "entitlement lookup failed:",
      error?.message ?? "no row for user",
    );
    return { allowed: false, reason: "lookup_failed", snapshot: null };
  }

  const snapshot = data as EntitlementSnapshot;
  const estimated = Math.max(0, opts.estimatedTokens ?? 5000);

  // 1. Report count quota
  if (snapshot.reports_remaining_mo <= 0) {
    return { allowed: false, reason: "report_limit", snapshot };
  }

  // 2. Token quota (estimated)
  if (snapshot.tokens_remaining_mo < estimated) {
    return { allowed: false, reason: "token_limit", snapshot };
  }

  // 3. Report type restriction
  if (
    opts.reportType &&
    !snapshot.allowed_report_types.includes(opts.reportType)
  ) {
    return { allowed: false, reason: "report_type_not_allowed", snapshot };
  }

  // 4. Provider restriction — soft downgrade rather than reject.
  let effective_provider = opts.provider;
  if (
    opts.provider &&
    snapshot.allowed_providers.length > 0 &&
    !snapshot.allowed_providers.includes(opts.provider)
  ) {
    effective_provider = snapshot.default_provider ??
      snapshot.allowed_providers[0];
  }

  return { allowed: true, reason: "ok", snapshot, effective_provider };
}

/** Build a stable client-facing error response from a denial. */
export function denialResponse(check: EntitlementCheck): {
  status: number;
  body: Record<string, unknown>;
} {
  return {
    status: 403,
    body: {
      error: "quota_exceeded",
      reason: check.reason,
      plan_id: check.snapshot?.plan_id ?? "free",
      reports_used: check.snapshot?.reports_used_mo ?? null,
      reports_limit: check.snapshot?.max_reports_mo ?? null,
      tokens_used: check.snapshot?.tokens_used_mo ?? null,
      tokens_limit: check.snapshot?.max_tokens_mo ?? null,
      upgrade_url: "harpa://upgrade",
    },
  };
}
