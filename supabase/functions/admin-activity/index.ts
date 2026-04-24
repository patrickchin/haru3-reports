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
  const kind = (url.searchParams.get("kind") ?? "").trim().toLowerCase();

  const [projectsRes, reportsRes, membersRes, usageRes, auditRes, profilesRes] = await Promise.all([
    serviceClient.from("projects").select("id, name, owner_id, created_at").is("deleted_at", null),
    serviceClient.from("reports").select("id, title, project_id, owner_id, status, created_at").is("deleted_at", null),
    serviceClient.from("project_members").select("id, project_id, user_id, role, created_at"),
    serviceClient.from("token_usage").select("id, user_id, project_id, provider, model, created_at"),
    serviceClient
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    serviceClient.from("profiles").select("id, full_name"),
  ]);

  for (const result of [projectsRes, reportsRes, membersRes, usageRes, auditRes, profilesRes]) {
    if (result.error) return errorResponse(500, result.error.message);
  }

  const profilesById = new Map((profilesRes.data ?? []).map((row) => [row.id, row]));
  const projectsById = new Map((projectsRes.data ?? []).map((row) => [row.id, row]));

  const events = [
    ...((projectsRes.data ?? []).map((row) => ({
      id: `site:${row.id}`,
      kind: "site",
      title: `Site created`,
      detail: `${row.name} · ${profilesById.get(row.owner_id)?.full_name ?? "Unknown owner"}`,
      createdAt: row.created_at,
    }))),
    ...((reportsRes.data ?? []).map((row) => ({
      id: `report:${row.id}`,
      kind: "report",
      title: row.title,
      detail: `${projectsById.get(row.project_id)?.name ?? "Unknown site"} · ${row.status}`,
      createdAt: row.created_at,
    }))),
    ...((membersRes.data ?? []).map((row) => ({
      id: `member:${row.id}`,
      kind: "member",
      title: `Site member added`,
      detail: `${projectsById.get(row.project_id)?.name ?? "Unknown site"} · ${profilesById.get(row.user_id)?.full_name ?? "Unknown user"} · ${row.role}`,
      createdAt: row.created_at,
    }))),
    ...((usageRes.data ?? []).map((row) => ({
      id: `usage:${row.id}`,
      kind: "ai",
      title: `AI generation`,
      detail: `${projectsById.get(row.project_id ?? "")?.name ?? "Unknown site"} · ${row.provider}/${row.model}`,
      createdAt: row.created_at,
    }))),
    ...((auditRes.data ?? []).map((row) => ({
      id: `audit:${row.id}`,
      kind: "admin",
      title: row.action,
      detail: `${row.target_type} · ${row.target_id}`,
      createdAt: row.created_at,
    }))),
  ]
    .filter((row) => (kind ? row.kind === kind : true))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return jsonResponse({
    data: events.slice(from, to + 1),
    meta: {
      total: events.length,
      page,
      limit,
    },
  });
});
