import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse(405, "Method not allowed");

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { serviceClient } = ctx;

  const [usersRes, orgsRes, projectsRes, reportsRes, usageRes, membersRes, auditRes] =
    await Promise.all([
      serviceClient.from("profiles").select("id, full_name, company_name, created_at"),
      serviceClient.from("organizations").select("id, name, plan").is("deleted_at", null),
      serviceClient
        .from("projects")
        .select("id, name, status, owner_id, organization_id, created_at")
        .is("deleted_at", null),
      serviceClient
        .from("reports")
        .select("id, title, project_id, owner_id, report_type, status, confidence, created_at, visit_date")
        .is("deleted_at", null),
      serviceClient
        .from("token_usage")
        .select("id, user_id, project_id, report_id, input_tokens, output_tokens, cached_tokens, provider, model, created_at"),
      serviceClient.from("project_members").select("id, project_id, user_id, role, created_at"),
      serviceClient
        .from("admin_audit_log")
        .select("id, action, target_type, target_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  for (const result of [usersRes, orgsRes, projectsRes, reportsRes, usageRes, membersRes, auditRes]) {
    if (result.error) return errorResponse(500, result.error.message);
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const users = usersRes.data ?? [];
  const orgs = orgsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const reports = reportsRes.data ?? [];
  const usage = usageRes.data ?? [];
  const members = membersRes.data ?? [];
  const audit = auditRes.data ?? [];

  const userById = new Map(users.map((row) => [row.id, row]));
  const projectById = new Map(projects.map((row) => [row.id, row]));

  const overview = {
    totalUsers: users.length,
    accounts: orgs.length,
    activeSites: projects.filter((row) => row.status === "active").length,
    delayedSites: projects.filter((row) => row.status === "delayed").length,
    completedSites: projects.filter((row) => row.status === "completed").length,
    totalReports: reports.length,
    draftReports: reports.filter((row) => row.status === "draft").length,
    finalReports: reports.filter((row) => row.status === "final").length,
    monthlyTokens: usage
      .filter((row) => new Date(row.created_at) >= monthStart)
      .reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0),
    memberAssignments: members.length,
  };

  const timeline = Array.from({ length: 7 }, (_item, index) => {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (6 - index));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const dayReports = reports.filter((row) => {
      const created = new Date(row.created_at);
      return created >= start && created < end;
    });
    const dayUsage = usage.filter((row) => {
      const created = new Date(row.created_at);
      return created >= start && created < end;
    });

    return {
      date: start.toISOString().slice(0, 10),
      reports: dayReports.length,
      tokens: dayUsage.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0),
      generations: dayUsage.length,
    };
  });

  const providerStats = new Map<string, {
    provider: string;
    model: string;
    runs: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
  }>();

  for (const row of usage) {
    const key = `${row.provider}:${row.model}`;
    const current = providerStats.get(key) ?? {
      provider: row.provider,
      model: row.model,
      runs: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
    };

    current.runs += 1;
    current.inputTokens += row.input_tokens;
    current.outputTokens += row.output_tokens;
    current.cachedTokens += row.cached_tokens;
    providerStats.set(key, current);
  }

  const providers = [...providerStats.values()]
    .map((row) => ({
      ...row,
      totalTokens: row.inputTokens + row.outputTokens,
      cacheRatio: row.inputTokens + row.outputTokens + row.cachedTokens === 0
        ? 0
        : Math.round((row.cachedTokens / (row.inputTokens + row.outputTokens + row.cachedTokens)) * 100),
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);

  const reportTypes = Object.entries(
    reports.reduce<Record<string, number>>((acc, row) => {
      acc[row.report_type] = (acc[row.report_type] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([key, count]) => ({ key, count }));

  const siteStatuses = Object.entries(
    projects.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([key, count]) => ({ key, count }));

  const attention = [
    ...projects
      .filter((row) => row.status === "delayed")
      .map((row) => ({
        id: `site:${row.id}`,
        severity: "high",
        title: row.name,
        detail: "Site is marked delayed and needs operational review.",
        createdAt: row.created_at,
      })),
    ...reports
      .filter((row) => row.status === "draft" && new Date(row.created_at) <= sevenDaysAgo)
      .map((row) => ({
        id: `report:${row.id}`,
        severity: "medium",
        title: row.title,
        detail: `${projectById.get(row.project_id)?.name ?? "Unknown site"} still has an older draft report.`,
        createdAt: row.created_at,
      })),
    ...projects
      .filter((row) => {
        const recentReports = reports.filter(
          (report) =>
            report.project_id === row.id &&
            new Date(report.created_at) >= sevenDaysAgo,
        );
        return row.status === "active" && recentReports.length === 0;
      })
      .map((row) => ({
        id: `coverage:${row.id}`,
        severity: "low",
        title: row.name,
        detail: "Active site has no recent reports in the last 7 days.",
        createdAt: row.created_at,
      })),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8);

  const activity = [
    ...projects
      .filter((row) => new Date(row.created_at) >= thirtyDaysAgo)
      .map((row) => ({
        id: `site:${row.id}`,
        kind: "site",
        title: `Site created: ${row.name}`,
        detail: userById.get(row.owner_id)?.full_name ?? "Unknown owner",
        createdAt: row.created_at,
      })),
    ...members
      .filter((row) => new Date(row.created_at) >= thirtyDaysAgo)
      .map((row) => ({
        id: `member:${row.id}`,
        kind: "member",
        title: `${projectById.get(row.project_id)?.name ?? "Unknown site"} member added`,
        detail: `${userById.get(row.user_id)?.full_name ?? "Unknown user"} · ${row.role}`,
        createdAt: row.created_at,
      })),
    ...reports
      .filter((row) => new Date(row.created_at) >= thirtyDaysAgo)
      .map((row) => ({
        id: `report:${row.id}`,
        kind: "report",
        title: row.title,
        detail: `${projectById.get(row.project_id)?.name ?? "Unknown site"} · ${row.status}`,
        createdAt: row.created_at,
      })),
    ...audit.map((row) => ({
      id: `audit:${row.id}`,
      kind: "audit",
      title: row.action,
      detail: String(row.target_type),
      createdAt: row.created_at,
    })),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 16);

  const sites = projects.map((project) => {
    const siteReports = reports.filter((row) => row.project_id === project.id);
    const siteMembers = members.filter((row) => row.project_id === project.id);
    const siteUsage = usage.filter((row) => row.project_id === project.id);
    const averageConfidenceSource = siteReports.filter((row) => row.confidence !== null);
    const lastActivity =
      [...siteReports.map((row) => row.visit_date ?? row.created_at), ...siteUsage.map((row) => row.created_at)]
        .sort()
        .slice(-1)[0] ?? null;

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      ownerName: userById.get(project.owner_id)?.full_name ?? "Unknown owner",
      reportCount: siteReports.length,
      draftCount: siteReports.filter((row) => row.status === "draft").length,
      memberCount: siteMembers.length + 1,
      lastActivity,
      tokenCount: siteUsage.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0),
      avgConfidence: averageConfidenceSource.length
        ? Math.round(
          averageConfidenceSource.reduce((sum, row) => sum + (row.confidence ?? 0), 0) /
            averageConfidenceSource.length,
        )
        : null,
    };
  })
    .sort((left, right) => right.tokenCount - left.tokenCount || right.reportCount - left.reportCount)
    .slice(0, 10);

  return jsonResponse({
    data: {
      overview,
      timeline,
      providers,
      reportTypes,
      siteStatuses,
      attention,
      activity,
      sites,
    },
  });
});
