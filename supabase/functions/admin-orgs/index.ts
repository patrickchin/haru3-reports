import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  auditAdminAction,
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
  const { serviceClient, admin } = ctx;

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const orgId = pathParts[1] ?? null;

  if (req.method === "GET" && !orgId) {
    const { page, limit } = parsePagination(url);
    const { from, to } = paginationRange(page, limit);
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const plan = (url.searchParams.get("plan") ?? "").trim().toLowerCase();

    const [orgsRes, membersRes, projectsRes, reportsRes, usageRes, profilesRes] =
      await Promise.all([
        serviceClient
          .from("organizations")
          .select("id, name, slug, plan, max_seats, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        serviceClient.from("org_members").select("organization_id, user_id, role"),
        serviceClient.from("projects").select("id, organization_id, name, status").is("deleted_at", null),
        serviceClient.from("reports").select("id, project_id").is("deleted_at", null),
        serviceClient.from("token_usage").select("project_id, input_tokens, output_tokens, cached_tokens"),
        serviceClient.from("profiles").select("id, full_name"),
      ]);

    for (const res of [orgsRes, membersRes, projectsRes, reportsRes, usageRes, profilesRes]) {
      if (res.error) return errorResponse(500, res.error.message);
    }

    const profilesById = new Map((profilesRes.data ?? []).map((row) => [row.id, row.full_name]));
    const reports = reportsRes.data ?? [];
    const usage = usageRes.data ?? [];
    const projects = projectsRes.data ?? [];
    const members = membersRes.data ?? [];

    const filtered = (orgsRes.data ?? [])
      .map((org) => {
        const orgMembers = members.filter((row) => row.organization_id === org.id);
        const orgProjects = projects.filter((row) => row.organization_id === org.id);
        const orgProjectIds = new Set(orgProjects.map((row) => row.id));
        const orgReports = reports.filter((row) => orgProjectIds.has(row.project_id));
        const orgUsage = usage.filter((row) => row.project_id && orgProjectIds.has(row.project_id));
        const ownerMembership = orgMembers.find((row) => row.role === "owner");

        return {
          ...org,
          owner_name: ownerMembership ? profilesById.get(ownerMembership.user_id) ?? null : null,
          member_count: orgMembers.length,
          site_count: orgProjects.length,
          active_site_count: orgProjects.filter((row) => row.status === "active").length,
          report_count: orgReports.length,
          token_count: orgUsage.reduce(
            (sum, row) => sum + row.input_tokens + row.output_tokens,
            0,
          ),
          cached_tokens: orgUsage.reduce((sum, row) => sum + row.cached_tokens, 0),
        };
      })
      .filter((org) => {
        const searchMatches = search
          ? `${org.name} ${org.slug} ${org.owner_name ?? ""}`.toLowerCase().includes(search)
          : true;
        const planMatches = plan ? org.plan === plan : true;
        return searchMatches && planMatches;
      });

    return jsonResponse({
      data: filtered.slice(from, to + 1),
      meta: { total: filtered.length, page, limit },
    });
  }

  if ((req.method === "PATCH" || req.method === "POST") && orgId) {
    const body = await req.json().catch(() => null);
    if (!body) return errorResponse(400, "Invalid request body");

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.slug === "string" && body.slug.trim()) updates.slug = body.slug.trim();
    if (typeof body.plan === "string" && ["free", "pro", "enterprise"].includes(body.plan)) {
      updates.plan = body.plan;
    }
    if (typeof body.max_seats === "number" && Number.isInteger(body.max_seats) && body.max_seats > 0) {
      updates.max_seats = body.max_seats;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse(400, "No valid organization updates provided");
    }

    const { data, error } = await serviceClient
      .from("organizations")
      .update(updates)
      .eq("id", orgId)
      .select("id, name, slug, plan, max_seats")
      .single();

    if (error) return errorResponse(500, error.message);

    await auditAdminAction(serviceClient, {
      action: "org.update",
      targetType: "organization",
      targetId: orgId,
      admin,
      metadata: updates,
    });

    return jsonResponse({ data });
  }

  return errorResponse(405, "Method not allowed");
});
