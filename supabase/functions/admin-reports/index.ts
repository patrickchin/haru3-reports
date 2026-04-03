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

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const reportId = pathParts[1] ?? null;

  // ── GET /admin-reports ───────────────────────────────────────────────
  if (req.method === "GET" && !reportId) {
    const { page, limit } = parsePagination(url);
    const { from, to } = paginationRange(page, limit);

    const search = url.searchParams.get("search") ?? "";
    const reportType = url.searchParams.get("report_type") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const lowConfidence = url.searchParams.get("low_confidence") === "true";

    let query = serviceClient
      .from("reports")
      .select(
        `id, title, report_type, status, visit_date, confidence, created_at,
         profiles!owner_id(id, full_name, phone),
         projects!project_id(id, name)`,
        { count: "exact" },
      )
      .range(from, to)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }
    if (reportType) query = query.eq("report_type", reportType);
    if (status) query = query.eq("status", status);
    if (lowConfidence) query = query.lt("confidence", 60).not("confidence", "is", null);

    const { data, error, count } = await query;
    if (error) return errorResponse(500, error.message);

    return jsonResponse({ data, meta: { total: count ?? 0, page, limit } });
  }

  // ── GET /admin-reports/:reportId ─────────────────────────────────────
  if (req.method === "GET" && reportId) {
    const { data, error } = await serviceClient
      .from("reports")
      .select(
        `*, profiles!owner_id(id, full_name, phone, company_name),
         projects!project_id(id, name, address)`,
      )
      .eq("id", reportId)
      .single();

    if (error) return errorResponse(404, "Report not found");

    const { data: genLog } = await serviceClient
      .from("report_generation_log")
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    return jsonResponse({ data: { report: data, generationLog: genLog ?? [] } });
  }

  return errorResponse(405, "Method not allowed");
});
