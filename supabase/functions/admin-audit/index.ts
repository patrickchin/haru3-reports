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
  if (req.method !== "GET") return errorResponse(405, "Method not allowed");

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { serviceClient } = ctx;

  const url = new URL(req.url);
  const { page, limit } = parsePagination(url);
  const { from, to } = paginationRange(page, limit);
  const action = (url.searchParams.get("action") ?? "").trim().toLowerCase();
  const targetType = (url.searchParams.get("target_type") ?? "").trim().toLowerCase();

  const { data, error } = await serviceClient
    .from("admin_audit_log")
    .select(`
      id,
      action,
      target_type,
      target_id,
      metadata,
      created_at,
      profiles:admin_id (
        id,
        full_name,
        company_name
      )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return errorResponse(500, error.message);

  const filtered = (data ?? []).filter((row) => {
    const actionMatches = action ? String(row.action).toLowerCase().includes(action) : true;
    const typeMatches = targetType ? String(row.target_type).toLowerCase() === targetType : true;
    return actionMatches && typeMatches;
  });

  return jsonResponse({
    data: filtered,
    meta: {
      total: filtered.length,
      page,
      limit,
    },
  });
});
