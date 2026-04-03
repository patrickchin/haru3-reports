import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { serviceClient } = ctx;

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") ?? "30")));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Total users
  const { count: totalUsers } = await serviceClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("disabled_at", null);

  // Users created in window
  const { count: newUsers } = await serviceClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  // Total projects
  const { count: totalProjects } = await serviceClient
    .from("projects")
    .select("id", { count: "exact", head: true });

  // Reports in window
  const { count: reportsInWindow } = await serviceClient
    .from("reports")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  // Total reports
  const { count: totalReports } = await serviceClient
    .from("reports")
    .select("id", { count: "exact", head: true });

  // Average confidence
  const { data: avgConf } = await serviceClient
    .from("reports")
    .select("confidence")
    .not("confidence", "is", null);

  const confidenceScores = (avgConf ?? []).map((r) => r.confidence as number);
  const avgConfidence = confidenceScores.length > 0
    ? Math.round(confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length)
    : null;

  // Low confidence reports (< 60)
  const { count: lowConfidenceCount } = await serviceClient
    .from("reports")
    .select("id", { count: "exact", head: true })
    .lt("confidence", 60)
    .not("confidence", "is", null);

  // Reports by day (last N days)
  const { data: reportsByDay } = await serviceClient
    .from("reports")
    .select("created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  const dayBuckets = buildDayBuckets(reportsByDay ?? [], days);

  // AI generation stats
  const { data: genLogs } = await serviceClient
    .from("report_generation_log")
    .select("provider, model, input_tokens, output_tokens, latency_ms, confidence, created_at")
    .gte("created_at", since);

  const aiStats = buildAiStats(genLogs ?? []);

  // Report type distribution
  const { data: allReports } = await serviceClient
    .from("reports")
    .select("report_type");

  const typeCounts: Record<string, number> = {};
  for (const r of allReports ?? []) {
    typeCounts[r.report_type] = (typeCounts[r.report_type] ?? 0) + 1;
  }

  // Top users by report count
  const { data: topUsers } = await serviceClient
    .from("reports")
    .select("owner_id, profiles!owner_id(full_name, phone)")
    .gte("created_at", since);

  const userCounts: Record<string, { name: string; count: number }> = {};
  for (const row of topUsers ?? []) {
    const p = row.profiles as { full_name: string | null; phone: string } | null;
    const label = p?.full_name ?? p?.phone ?? row.owner_id;
    if (!userCounts[row.owner_id]) {
      userCounts[row.owner_id] = { name: label, count: 0 };
    }
    userCounts[row.owner_id].count++;
  }

  const topUsersList = Object.values(userCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return jsonResponse({
    data: {
      summary: {
        totalUsers: totalUsers ?? 0,
        newUsers: newUsers ?? 0,
        totalProjects: totalProjects ?? 0,
        totalReports: totalReports ?? 0,
        reportsInWindow: reportsInWindow ?? 0,
        avgConfidence,
        lowConfidenceCount: lowConfidenceCount ?? 0,
        windowDays: days,
      },
      reportsByDay: dayBuckets,
      aiStats,
      reportsByType: Object.entries(typeCounts).map(([type, count]) => ({ type, count })),
      topUsers: topUsersList,
    },
  });
});

function buildDayBuckets(
  rows: Array<{ created_at: string }>,
  days: number,
): Array<{ date: string; count: number }> {
  const buckets: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    if (key in buckets) buckets[key]++;
  }
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}

function buildAiStats(
  logs: Array<{
    provider: string;
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    latency_ms: number | null;
    confidence: number | null;
    created_at: string;
  }>,
) {
  const providerCounts: Record<string, number> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const latencies: number[] = [];

  for (const log of logs) {
    providerCounts[log.provider] = (providerCounts[log.provider] ?? 0) + 1;
    totalInputTokens += log.input_tokens ?? 0;
    totalOutputTokens += log.output_tokens ?? 0;
    if (log.latency_ms != null) latencies.push(log.latency_ms);
  }

  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  return {
    totalCalls: logs.length,
    totalInputTokens,
    totalOutputTokens,
    avgLatencyMs: avgLatency,
    byProvider: Object.entries(providerCounts).map(([provider, count]) => ({
      provider,
      count,
    })),
  };
}
