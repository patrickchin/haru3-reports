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
  const orgId = pathParts[1] ?? null;

  // ── GET /admin-orgs ──────────────────────────────────────────────────
  if (req.method === "GET" && !orgId) {
    const { page, limit } = parsePagination(url);
    const { from, to } = paginationRange(page, limit);
    const search = url.searchParams.get("search") ?? "";

    let query = serviceClient
      .from("organizations")
      .select(`id, name, slug, plan, max_seats, created_at, updated_at`, { count: "exact" })
      .range(from, to)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return errorResponse(500, error.message);

    // Fetch member counts separately
    const ids = (data ?? []).map((o) => o.id);
    const memberCountMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: counts } = await serviceClient
        .from("org_members")
        .select("organization_id")
        .in("organization_id", ids);

      for (const row of counts ?? []) {
        memberCountMap[row.organization_id] =
          (memberCountMap[row.organization_id] ?? 0) + 1;
      }
    }

    const enriched = (data ?? []).map((org) => ({
      ...org,
      member_count: memberCountMap[org.id] ?? 0,
    }));

    return jsonResponse({ data: enriched, meta: { total: count ?? 0, page, limit } });
  }

  // ── GET /admin-orgs/:orgId ───────────────────────────────────────────
  if (req.method === "GET" && orgId) {
    const { data: org, error } = await serviceClient
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .single();

    if (error) return errorResponse(404, "Organization not found");

    const { data: members } = await serviceClient
      .from("org_members")
      .select(`id, role, joined_at, profiles(id, full_name, phone, company_name)`)
      .eq("organization_id", orgId)
      .order("joined_at", { ascending: false });

    const { data: projects, count: projectCount } = await serviceClient
      .from("projects")
      .select("id, name, status, created_at", { count: "exact" })
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10);

    return jsonResponse({ data: { org, members, projects, projectCount } });
  }

  // ── POST /admin-orgs ─────────────────────────────────────────────────
  if (req.method === "POST" && !orgId) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }

    const name = (body.name as string | undefined)?.trim();
    const slug = (body.slug as string | undefined)?.trim();

    if (!name || !slug) return errorResponse(400, "name and slug are required");
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return errorResponse(400, "slug must be lowercase alphanumeric with hyphens");
    }

    const { data: org, error } = await serviceClient
      .from("organizations")
      .insert({
        name,
        slug,
        plan: (body.plan as string) ?? "free",
        max_seats: (body.max_seats as number) ?? 5,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return errorResponse(409, "Slug already in use");
      return errorResponse(500, error.message);
    }

    await writeAuditLog(serviceClient, {
      adminId,
      action: "org.create",
      targetType: "organization",
      targetId: org.id,
      metadata: { name, slug },
    });

    return jsonResponse({ data: org }, 201);
  }

  // ── PATCH /admin-orgs/:orgId ─────────────────────────────────────────
  if (req.method === "PATCH" && orgId) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }

    const allowed = ["name", "plan", "max_seats"] as const;
    const updates: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) updates[k] = body[k];
    }

    const { error } = await serviceClient
      .from("organizations")
      .update(updates)
      .eq("id", orgId);

    if (error) return errorResponse(500, error.message);

    await writeAuditLog(serviceClient, {
      adminId,
      action: "org.update",
      targetType: "organization",
      targetId: orgId,
      metadata: updates,
    });

    return jsonResponse({ success: true });
  }

  // ── POST /admin-orgs/:orgId/members ──────────────────────────────────
  if (req.method === "POST" && orgId) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }

    const memberId = body.user_id as string | undefined;
    if (!memberId) return errorResponse(400, "user_id is required");

    const { error } = await serviceClient
      .from("org_members")
      .insert({ organization_id: orgId, user_id: memberId, role: body.role ?? "member" });

    if (error) {
      if (error.code === "23505") return errorResponse(409, "User is already a member");
      return errorResponse(500, error.message);
    }

    await writeAuditLog(serviceClient, {
      adminId,
      action: "org.add_member",
      targetType: "organization",
      targetId: orgId,
      metadata: { user_id: memberId },
    });

    return jsonResponse({ success: true }, 201);
  }

  return errorResponse(405, "Method not allowed");
});
