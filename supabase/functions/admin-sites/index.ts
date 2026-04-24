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
  const siteId = pathParts[1] ?? null;

  if (req.method === "GET" && !siteId) {
    const { page, limit } = parsePagination(url);
    const { from, to } = paginationRange(page, limit);
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    const status = (url.searchParams.get("status") ?? "").trim().toLowerCase();

    const [projectsRes, profilesRes, reportsRes, usageRes, membersRes] = await Promise.all([
      serviceClient
        .from("projects")
        .select("id, name, address, client_name, status, owner_id, organization_id, created_at, updated_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      serviceClient.from("profiles").select("id, full_name, company_name"),
      serviceClient
        .from("reports")
        .select("id, project_id, status, confidence, created_at, visit_date")
        .is("deleted_at", null),
      serviceClient
        .from("token_usage")
        .select("project_id, input_tokens, output_tokens, cached_tokens, created_at"),
      serviceClient.from("project_members").select("project_id, user_id, role"),
    ]);

    for (const result of [projectsRes, profilesRes, reportsRes, usageRes, membersRes]) {
      if (result.error) return errorResponse(500, result.error.message);
    }

    const profilesById = new Map((profilesRes.data ?? []).map((row) => [row.id, row]));
    const reports = reportsRes.data ?? [];
    const usage = usageRes.data ?? [];
    const members = membersRes.data ?? [];

    const rows = (projectsRes.data ?? [])
      .map((project) => {
        const siteReports = reports.filter((row) => row.project_id === project.id);
        const siteUsage = usage.filter((row) => row.project_id === project.id);
        const siteMembers = members.filter((row) => row.project_id === project.id);
        const lastReport = siteReports
          .map((row) => row.visit_date ?? row.created_at)
          .sort()
          .slice(-1)[0] ?? null;
        const confidenceRows = siteReports.filter((row) => row.confidence !== null);

        return {
          ...project,
          owner: profilesById.get(project.owner_id) ?? null,
          member_count: siteMembers.length + 1,
          report_count: siteReports.length,
          draft_count: siteReports.filter((row) => row.status === "draft").length,
          final_count: siteReports.filter((row) => row.status === "final").length,
          avg_confidence: confidenceRows.length
            ? Math.round(
              confidenceRows.reduce((sum, row) => sum + (row.confidence ?? 0), 0) /
                confidenceRows.length,
            )
            : null,
          token_count: siteUsage.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0),
          cached_tokens: siteUsage.reduce((sum, row) => sum + row.cached_tokens, 0),
          last_report: lastReport,
        };
      })
      .filter((project) => {
        const searchMatches = search
          ? `${project.name} ${project.address ?? ""} ${project.client_name ?? ""} ${project.owner?.full_name ?? ""}`
            .toLowerCase()
            .includes(search)
          : true;
        const statusMatches = status ? project.status === status : true;
        return searchMatches && statusMatches;
      });

    return jsonResponse({
      data: rows.slice(from, to + 1),
      meta: { total: rows.length, page, limit },
    });
  }

  if (req.method === "GET" && siteId) {
    const [projectRes, reportsRes, usageRes, membersRes, profilesRes] = await Promise.all([
      serviceClient
        .from("projects")
        .select("id, name, address, client_name, status, owner_id, organization_id, created_at, updated_at, deleted_at")
        .eq("id", siteId)
        .maybeSingle(),
      serviceClient
        .from("reports")
        .select("id, title, status, report_type, confidence, created_at, visit_date")
        .eq("project_id", siteId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("token_usage")
        .select("id, user_id, input_tokens, output_tokens, cached_tokens, provider, model, created_at, report_id")
        .eq("project_id", siteId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("project_members")
        .select("id, user_id, role, created_at")
        .eq("project_id", siteId)
        .order("created_at", { ascending: false }),
      serviceClient.from("profiles").select("id, full_name, company_name, phone"),
    ]);

    for (const result of [projectRes, reportsRes, usageRes, membersRes, profilesRes]) {
      if (result.error) return errorResponse(500, result.error.message);
    }

    if (!projectRes.data) return errorResponse(404, "Site not found");

    const profilesById = new Map((profilesRes.data ?? []).map((row) => [row.id, row]));
    const owner = profilesById.get(projectRes.data.owner_id) ?? null;

    return jsonResponse({
      data: {
        site: {
          ...projectRes.data,
          owner,
        },
        reports: reportsRes.data ?? [],
        usage: usageRes.data ?? [],
        members: [
          owner
            ? {
              id: `owner:${owner.id}`,
              user_id: owner.id,
              role: "owner",
              created_at: projectRes.data.created_at,
              full_name: owner.full_name,
              company_name: owner.company_name,
              phone: owner.phone,
            }
            : null,
          ...((membersRes.data ?? []).map((row) => ({
            ...row,
            full_name: profilesById.get(row.user_id)?.full_name ?? null,
            company_name: profilesById.get(row.user_id)?.company_name ?? null,
            phone: profilesById.get(row.user_id)?.phone ?? null,
          }))),
        ].filter(Boolean),
      },
    });
  }

  if ((req.method === "PATCH" || req.method === "POST") && siteId) {
    const body = await req.json().catch(() => null);
    if (!body) return errorResponse(400, "Invalid request body");

    const updates: Record<string, unknown> = {};
    if (typeof body.status === "string" && ["active", "delayed", "completed", "archived"].includes(body.status)) {
      updates.status = body.status;
    }
    if (body.archive === true) updates.deleted_at = new Date().toISOString();
    if (body.restore === true) updates.deleted_at = null;

    if (Object.keys(updates).length === 0) {
      return errorResponse(400, "No valid site updates provided");
    }

    const { data, error } = await serviceClient
      .from("projects")
      .update(updates)
      .eq("id", siteId)
      .select("id, name, status, deleted_at")
      .single();
    if (error) return errorResponse(500, error.message);

    await auditAdminAction(serviceClient, {
      action: "site.update",
      targetType: "project",
      targetId: siteId,
      admin,
      metadata: updates,
    });

    return jsonResponse({ data });
  }

  return errorResponse(405, "Method not allowed");
});
