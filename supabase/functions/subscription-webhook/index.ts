/**
 * RevenueCat → Supabase subscription webhook.
 *
 * Receives normalised subscription events from RevenueCat (Apple IAP,
 * Google Play, Stripe web), validates the bearer-token shared secret,
 * maps store products to internal plan ids, and persists state via the
 * transactional `process_subscription_event` RPC.
 *
 * Deploy WITHOUT JWT verification:
 *   supabase functions deploy subscription-webhook --no-verify-jwt
 *
 * Required environment:
 *   REVENUECAT_WEBHOOK_SECRET   shared secret (same value pasted into the
 *                               RevenueCat dashboard → Integrations → Webhook
 *                               under "Authorization Header Value")
 *   SUPABASE_URL                supplied by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY   supplied by Supabase runtime
 *
 * See docs/features/01-payment-system-design.md §5.1 and §8.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRODUCT_TO_PLAN: Record<string, "pro" | "team"> = {
  harpa_pro_monthly: "pro",
  harpa_pro_yearly: "pro",
  harpa_team_monthly: "team",
  harpa_team_yearly: "team",
};

type RcEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "PRODUCT_CHANGE"
  | "CANCELLATION"
  | "BILLING_ISSUE"
  | "EXPIRATION"
  | "SUBSCRIBER_ALIAS"
  | "TRANSFER"
  | "UNCANCELLATION"
  | "NON_RENEWING_PURCHASE";

interface RcEvent {
  id?: string;
  type?: RcEventType | string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  store?: string; // 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | ...
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  environment?: string;
}

interface RcWebhookBody {
  event?: RcEvent;
  api_version?: string;
}

const STORE_TO_PLATFORM: Record<string, "apple" | "google" | "stripe"> = {
  APP_STORE: "apple",
  MAC_APP_STORE: "apple",
  PLAY_STORE: "google",
  STRIPE: "stripe",
};

interface MappedEvent {
  user_id: string;
  plan_id: string;
  status: "active" | "grace_period" | "billing_retry" | "cancelled" | "expired";
  platform: "apple" | "google" | "stripe" | "manual";
  product_id: string | null;
  rc_event_id: string | null;
  period_start: string | null;
  period_end: string | null;
  event_type: string;
  /** When true the upstream event should be acknowledged but no DB write performed. */
  ignore?: boolean;
  /** Reason ignored, for logs. */
  ignore_reason?: string;
}

/**
 * Map a RevenueCat event into the internal shape consumed by
 * `process_subscription_event`. Pure function — exported for unit tests.
 */
export function mapRcEvent(body: RcWebhookBody): MappedEvent | null {
  const ev = body?.event;
  if (!ev || typeof ev !== "object") return null;

  const userId = ev.app_user_id ?? ev.original_app_user_id;
  if (!userId) return null;

  const platform = STORE_TO_PLATFORM[ev.store ?? ""] ?? "manual";
  const productId = ev.product_id ?? null;

  const periodStart = ev.purchased_at_ms
    ? new Date(ev.purchased_at_ms).toISOString()
    : null;
  const periodEnd = ev.expiration_at_ms
    ? new Date(ev.expiration_at_ms).toISOString()
    : null;

  const type = String(ev.type ?? "").toUpperCase();

  // Map RC event type → internal status + plan
  let status: MappedEvent["status"] = "active";
  let planId: string;

  switch (type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
    case "NON_RENEWING_PURCHASE":
      planId = productId ? PRODUCT_TO_PLAN[productId] ?? "free" : "free";
      status = "active";
      break;

    case "CANCELLATION":
      // CANCELLATION fires on user cancel OR refund. If refunded
      // immediately (no expiration in the future) → expired & free.
      // Otherwise keep the paid plan until period ends.
      if (periodEnd && new Date(periodEnd).getTime() > Date.now()) {
        planId = productId ? PRODUCT_TO_PLAN[productId] ?? "free" : "free";
        status = "active";
      } else {
        planId = "free";
        status = "cancelled";
      }
      break;

    case "BILLING_ISSUE":
      planId = productId ? PRODUCT_TO_PLAN[productId] ?? "free" : "free";
      status = "billing_retry";
      break;

    case "EXPIRATION":
      planId = "free";
      status = "expired";
      break;

    case "SUBSCRIBER_ALIAS":
    case "TRANSFER":
      // Identity-only events: no quota change. We ack but don't write
      // (TRANSFER between accounts needs human review per design doc §5.1).
      return {
        user_id: userId,
        plan_id: "free",
        status: "active",
        platform,
        product_id: productId,
        rc_event_id: ev.id ?? null,
        period_start: periodStart,
        period_end: periodEnd,
        event_type: type,
        ignore: true,
        ignore_reason: "identity_event_no_state_change",
      };

    default:
      return {
        user_id: userId,
        plan_id: "free",
        status: "active",
        platform,
        product_id: productId,
        rc_event_id: ev.id ?? null,
        period_start: periodStart,
        period_end: periodEnd,
        event_type: type || "UNKNOWN",
        ignore: true,
        ignore_reason: `unhandled_type:${type}`,
      };
  }

  return {
    user_id: userId,
    plan_id: planId,
    status,
    platform,
    product_id: productId,
    rc_event_id: ev.id ?? null,
    period_start: periodStart,
    period_end: periodEnd,
    event_type: type,
  };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return timingSafeEqual(ab, bb);
}

export interface HandlerDeps {
  webhookSecret?: string;
  supabaseUrl?: string;
  serviceRoleKey?: string;
  /** Test seam — replaces the supabase service client. */
  rpcFn?: (mapped: MappedEvent, raw: unknown) => Promise<{ error: unknown }>;
  /** Test seam — replaces dead-letter insert. */
  recordFailureFn?: (
    eventId: string | null,
    payload: unknown,
    error: string,
  ) => Promise<void>;
}

export function createHandler(deps: HandlerDeps = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" });
    }

    const secret = deps.webhookSecret ??
      Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
    if (!secret) {
      console.error("subscription-webhook: REVENUECAT_WEBHOOK_SECRET not set");
      return jsonResponse(500, { error: "misconfigured" });
    }

    const auth = req.headers.get("authorization") ?? "";
    if (!timingSafeStringEqual(auth, `Bearer ${secret}`)) {
      return jsonResponse(401, { error: "unauthorized" });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse(400, { error: "invalid_json" });
    }

    const mapped = mapRcEvent(raw as RcWebhookBody);
    if (!mapped) {
      return jsonResponse(400, { error: "unparsable_event" });
    }

    if (mapped.ignore) {
      console.log(
        "subscription-webhook: ignoring event",
        { type: mapped.event_type, reason: mapped.ignore_reason },
      );
      return jsonResponse(200, { ok: true, ignored: mapped.ignore_reason });
    }

    const rpc = deps.rpcFn ?? defaultRpc;
    const recordFailure = deps.recordFailureFn ?? defaultRecordFailure;

    try {
      const { error } = await rpc(mapped, raw);
      if (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await recordFailure(mapped.rc_event_id, raw, msg).catch(() => {});
        // Return 500 so RevenueCat retries with backoff.
        return jsonResponse(500, { error: "rpc_failed" });
      }
      return jsonResponse(200, { ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordFailure(mapped.rc_event_id, raw, msg).catch(() => {});
      return jsonResponse(500, { error: "internal_error" });
    }
  };
}

async function defaultRpc(
  mapped: MappedEvent,
  _raw: unknown,
): Promise<{ error: unknown }> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return { error: new Error("missing_supabase_env") };
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.rpc("process_subscription_event", {
    p_user_id: mapped.user_id,
    p_plan_id: mapped.plan_id,
    p_status: mapped.status,
    p_platform: mapped.platform,
    p_rc_customer_id: mapped.user_id,
    p_store_product_id: mapped.product_id,
    p_store_txn_id: null,
    p_period_start: mapped.period_start,
    p_period_end: mapped.period_end,
    p_event_type: mapped.event_type,
    p_old_plan_id: null,
    p_rc_event_id: mapped.rc_event_id,
    p_metadata: { received_at: new Date().toISOString() },
  });

  return { error };
}

async function defaultRecordFailure(
  eventId: string | null,
  payload: unknown,
  error: string,
): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.from("webhook_failures").insert({
    event_id: eventId,
    payload,
    error,
  });
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const handler = createHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
