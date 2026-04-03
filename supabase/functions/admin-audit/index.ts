import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  parsePagination,
  paginationRange,
  requireAdmin,
} from "../_shared/admin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { serviceClient } = ctx;

  if (req.method !== "GET") return errorResponse(405, "Method not allowed");

  const url = new URL(req.url);
  const { page, limit } = parsePagination(url);
  const { from, to } = paginationRange(page, limit);

  const adminId = url.searchParams.get("admin_id") ?? "";
  const targetType = url.searchParams.get("target_type") ?? "";
  const action = url.searchParams.get("action") ?? "";

  let query = serviceClient
    .from("admin_audit_log")
    .select(
      `id, action, target_type, target_id, metadata, created_at,
       profiles!admin_id(id, full_name, phone)`,
      { count: "exact" },
    )
    .range(from, to)
    .order("created_at", { ascending: false });

  if (adminId) query = query.eq("admin_id", adminId);
  if (targetType) query = query.eq("target_type", targetType);
  if (action) query = query.ilike("action", `%${action}%`);

  const { data, error, count } = await query;
  if (error) return errorResponse(500, error.message);

  return jsonResponse({ data, meta: { total: count ?? 0, page, limit } });
});
