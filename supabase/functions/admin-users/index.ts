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
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();

  const [profilesRes, projectsRes, reportsRes, usageRes, membershipRes] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id, phone, full_name, company_name, created_at, updated_at")
      .order("created_at", { ascending: false }),
    serviceClient.from("projects").select("id, owner_id").is("deleted_at", null),
    serviceClient.from("reports").select("id, owner_id, created_at").is("deleted_at", null),
    serviceClient.from("token_usage").select("user_id, input_tokens, output_tokens, created_at"),
    serviceClient.from("project_members").select("user_id, role"),
  ]);

  for (const result of [profilesRes, projectsRes, reportsRes, usageRes, membershipRes]) {
    if (result.error) return errorResponse(500, result.error.message);
  }

  const projects = projectsRes.data ?? [];
  const reports = reportsRes.data ?? [];
  const usage = usageRes.data ?? [];
  const memberships = membershipRes.data ?? [];

  const rows = (profilesRes.data ?? [])
    .map((profile) => {
      const ownedProjects = projects.filter((row) => row.owner_id === profile.id);
      const ownedReports = reports.filter((row) => row.owner_id === profile.id);
      const userMemberships = memberships.filter((row) => row.user_id === profile.id);
      const userUsage = usage.filter((row) => row.user_id === profile.id);
      const lastActivity =
        [...ownedReports.map((row) => row.created_at), ...userUsage.map((row) => row.created_at)]
          .sort()
          .slice(-1)[0] ?? null;

      return {
        ...profile,
        project_count: ownedProjects.length,
        report_count: ownedReports.length,
        member_count: userMemberships.length,
        roles: [...new Set(userMemberships.map((row) => row.role))],
        total_tokens: userUsage.reduce(
          (sum, row) => sum + row.input_tokens + row.output_tokens,
          0,
        ),
        last_activity: lastActivity,
      };
    })
    .filter((profile) => {
      if (!search) return true;
      const haystack = `${profile.phone} ${profile.full_name ?? ""} ${profile.company_name ?? ""}`.toLowerCase();
      return haystack.includes(search);
    });

  return jsonResponse({
    data: rows.slice(from, to + 1),
    meta: {
      total: rows.length,
      page,
      limit,
    },
  });
});
