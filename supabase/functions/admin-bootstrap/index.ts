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
  const { serviceClient, admin } = ctx;

  const [profilesRes, projectsRes, reportsRes] = await Promise.all([
    serviceClient.from("profiles").select("id", { count: "exact", head: true }),
    serviceClient.from("projects").select("id", { count: "exact", head: true }).is("deleted_at", null),
    serviceClient.from("reports").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);

  for (const result of [profilesRes, projectsRes, reportsRes]) {
    if (result.error) return errorResponse(500, result.error.message);
  }

  return jsonResponse({
    data: {
      admin,
      stats: {
        users: profilesRes.count ?? 0,
        sites: projectsRes.count ?? 0,
        reports: reportsRes.count ?? 0,
      },
    },
  });
});
