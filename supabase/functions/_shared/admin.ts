import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// ============================================================
// Shared admin utilities for Edge Functions
// ============================================================

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

export type AdminContext = {
  adminId: string;
  serviceClient: SupabaseClient;
};

/**
 * Verifies the caller is an authenticated admin, then returns the service_role
 * Supabase client and the caller's user ID. Throws on failure.
 */
export async function requireAdmin(
  req: Request,
): Promise<AdminContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse(401, "Missing authorization header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the JWT using the anon client (which validates against Supabase Auth)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();

  if (error || !user) return errorResponse(401, "Invalid or expired token");

  // Check admin role via app_metadata (set via service_role API)
  const role = user.app_metadata?.app_role as string | undefined;
  if (role !== "admin" && role !== "super_admin") {
    return errorResponse(403, "Forbidden — admin role required");
  }

  const serviceClient = createClient(supabaseUrl, serviceKey);

  return { adminId: user.id, serviceClient };
}

/** Write an immutable audit log entry. Failures are swallowed to avoid
 *  masking the primary operation error. */
export async function writeAuditLog(
  client: SupabaseClient,
  entry: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}

export type PaginationParams = {
  page: number;
  limit: number;
};

export function parsePagination(url: URL): PaginationParams {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25")));
  return { page, limit };
}

export function paginationRange(page: number, limit: number): { from: number; to: number } {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { from, to };
}
