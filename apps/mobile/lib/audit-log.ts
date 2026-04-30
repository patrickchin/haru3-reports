/**
 * Client-side audit logging.
 *
 * Calls the `record_audit_event` RPC (see migration 202605010001) which
 * stamps actor_id from `auth.uid()`. Failures are best-effort and are
 * swallowed (after scrubbed warning) so missing audit rows never break
 * the user-facing flow.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger, scrubValue } from "@/lib/logger";

export type AuditOutcome = "success" | "failure" | "denied";

export type AuditEventInput = {
  event_type: string;
  outcome?: AuditOutcome;
  resource?: string;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditClient = Pick<SupabaseClient, "rpc">;

/**
 * Resolve the default Supabase client lazily so this module can be unit
 * tested without pulling in `lib/backend.ts` (which imports native-only
 * modules unavailable to the Node-based vitest runner).
 */
async function getDefaultClient(): Promise<AuditClient> {
  const mod = await import("@/lib/backend");
  return mod.backend as AuditClient;
}

export async function recordAuditEvent(
  event: AuditEventInput,
  client?: AuditClient,
): Promise<void> {
  try {
    const c = client ?? (await getDefaultClient());
    const { error } = await c.rpc("record_audit_event", {
      p_event_type: event.event_type,
      p_outcome: event.outcome ?? "success",
      p_resource: event.resource ?? null,
      p_resource_id: event.resource_id ?? null,
      p_metadata: scrubValue(event.metadata ?? {}) as Record<string, unknown>,
    });
    if (error) {
      logger.warn("audit log RPC failed", { event_type: event.event_type });
    }
  } catch (err) {
    logger.warn("audit log threw", { event_type: event.event_type, error: err });
  }
}
