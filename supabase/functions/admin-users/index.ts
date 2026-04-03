import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  parsePagination,
  paginationRange,
  requireAdmin,
  writeAuditLog,
} from "../_shared/admin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { adminId, serviceClient } = ctx;

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // pathParts: ['admin-users'] or ['admin-users', '<userId>']
  const userId = pathParts[1] ?? null;

  // ── GET /admin-users ─────────────────────────────────────────────────
  if (req.method === "GET" && !userId) {
    const { page, limit } = parsePagination(url);
    const { from, to } = paginationRange(page, limit);

    const search = url.searchParams.get("search") ?? "";
    const orgId = url.searchParams.get("org_id") ?? "";
    const showDisabled = url.searchParams.get("disabled") === "true";

    let query = serviceClient
      .from("profiles")
      .select(
        `id, phone, full_name, company_name, disabled_at, created_at, updated_at,
         user_roles(role),
         org_members(organization_id, role, organizations(name, slug))`,
        { count: "exact" },
      )
      .range(from, to)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%`,
      );
    }

    if (orgId) {
      query = query.eq("org_members.organization_id", orgId);
    }

    if (!showDisabled) {
      query = query.is("disabled_at", null);
    }

    const { data, error, count } = await query;
    if (error) return errorResponse(500, error.message);

    return jsonResponse({ data, meta: { total: count ?? 0, page, limit } });
  }

  // ── GET /admin-users/:userId ──────────────────────────────────────────
  if (req.method === "GET" && userId) {
    const { data: profile, error: profileErr } = await serviceClient
      .from("profiles")
      .select(`*, user_roles(role), org_members(organization_id, role, organizations(name, slug))`)
      .eq("id", userId)
      .single();

    if (profileErr) return errorResponse(404, "User not found");

    const { data: projects } = await serviceClient
      .from("projects")
      .select("id, name, status, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: reports } = await serviceClient
      .from("reports")
      .select("id, title, report_type, status, confidence, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: genLogs } = await serviceClient
      .from("report_generation_log")
      .select("id, provider, model, input_tokens, output_tokens, latency_ms, confidence, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return jsonResponse({ data: { profile, projects, reports, genLogs } });
  }

  // ── PATCH /admin-users/:userId ────────────────────────────────────────
  if (req.method === "PATCH" && userId) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }

    const allowedFields = ["full_name", "company_name"] as const;
    const profileUpdates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) profileUpdates[field] = body[field];
    }

    // Handle disable/enable
    if (body.disabled === true) {
      profileUpdates.disabled_at = new Date().toISOString();
    } else if (body.disabled === false) {
      profileUpdates.disabled_at = null;
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error } = await serviceClient
        .from("profiles")
        .update(profileUpdates)
        .eq("id", userId);
      if (error) return errorResponse(500, error.message);
    }

    // Handle role assignment
    if (body.role !== undefined) {
      const role = body.role as string;
      if (!["user", "org_admin", "admin", "super_admin"].includes(role)) {
        return errorResponse(400, "Invalid role value");
      }
      // Upsert the primary role
      await serviceClient.from("user_roles").upsert({ user_id: userId, role });
    }

    const action = body.disabled === true
      ? "user.disable"
      : body.disabled === false
      ? "user.enable"
      : "user.update";

    await writeAuditLog(serviceClient, {
      adminId,
      action,
      targetType: "user",
      targetId: userId,
      metadata: { changes: body },
    });

    return jsonResponse({ success: true });
  }

  return errorResponse(405, "Method not allowed");
});
