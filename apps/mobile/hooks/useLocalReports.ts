/**
 * Report hooks — list / detail / mutations (REST-backed via supabase-js).
 *
 * Names retain the `useLocal*` prefix to minimise churn during the
 * offline-mode v1 removal; see useLocalProjects.ts for context.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { backend } from "@/lib/backend";

export function reportsKey(projectId: string | undefined | null) {
  return ["reports", projectId ?? null] as const;
}
export function reportKey(reportId: string | undefined | null) {
  return ["report", reportId ?? null] as const;
}

export type ListedReport = {
  id: string;
  title: string;
  report_type: string;
  status: string;
  visit_date: string | null;
  created_at: string;
};

export function useLocalReports(projectId: string | undefined | null) {
  return useQuery<ListedReport[]>({
    queryKey: reportsKey(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<ListedReport[]> => {
      if (!projectId) return [];
      const { data, error } = await backend
        .from("reports")
        .select("id, title, report_type, status, visit_date, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ListedReport[];
    },
  });
}

export type ReportDetail = {
  id: string;
  project_id: string;
  title: string;
  report_type: string;
  status: string;
  visit_date: string | null;
  report_data: Record<string, unknown>;
  last_generation: Record<string, unknown> | null;
  confidence: number | null;
  created_at: string;
  /**
   * Local-only fields preserved for caller compatibility during the
   * offline-removal transition. Always undefined post-removal; will be
   * dropped once the remaining `?.sync_state` references in the rest
   * of the app are removed.
   */
  generation_state?: undefined;
  generation_error?: undefined;
  sync_state?: undefined;
};

export function useLocalReport(reportId: string | undefined | null) {
  return useQuery<ReportDetail | null>({
    queryKey: reportKey(reportId),
    enabled: !!reportId,
    queryFn: async (): Promise<ReportDetail | null> => {
      if (!reportId) return null;
      const { data, error } = await backend
        .from("reports")
        .select(
          "id, project_id, title, report_type, status, visit_date, report_data, last_generation, confidence, created_at",
        )
        .eq("id", reportId)
        .single();
      if (error) throw error;
      return {
        id: String(data.id),
        project_id: String(data.project_id),
        title: data.title ?? "",
        report_type: data.report_type ?? "daily",
        status: data.status ?? "draft",
        visit_date: data.visit_date ?? null,
        report_data:
          (data.report_data as Record<string, unknown> | null) ?? {},
        last_generation:
          (data.last_generation as Record<string, unknown> | null) ?? null,
        confidence: data.confidence ?? null,
        created_at: String(data.created_at ?? new Date().toISOString()),
      };
    },
  });
}

export type CreateReportArgs = {
  projectId: string;
  title?: string;
  reportType?: string;
  /**
   * Pre-generated ID for optimistic navigation. Preserved for caller
   * compatibility — currently ignored by the REST path because the
   * server assigns the id, but kept in the type so callers don't need
   * to be touched. Will be wired up again in v2 if/when offline lands.
   */
  optimisticId?: string;
};

export type UpdateReportFields = Partial<{
  title: string;
  report_type: string;
  status: string;
  visit_date: string | null;
  report_data: Record<string, unknown>;
  last_generation: Record<string, unknown> | null;
  confidence: number | null;
  notes: unknown;
}>;

export function useLocalReportMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const create = useMutation({
    mutationFn: async (input: CreateReportArgs): Promise<{ id: string }> => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await backend
        .from("reports")
        .insert({
          project_id: input.projectId,
          owner_id: user.id,
          title: input.title ?? "",
          report_type: input.reportType ?? "daily",
          status: "draft",
          notes: [],
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, args) => {
      queryClient.invalidateQueries({ queryKey: reportsKey(args.projectId) });
    },
  });

  const update = useMutation({
    mutationFn: async (args: {
      id: string;
      projectId?: string;
      fields: UpdateReportFields;
    }) => {
      const { error } = await backend
        .from("reports")
        .update(args.fields)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      queryClient.invalidateQueries({ queryKey: reportKey(args.id) });
      if (args.projectId) {
        queryClient.invalidateQueries({ queryKey: reportsKey(args.projectId) });
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (args: { id: string; projectId?: string }) => {
      // Soft-delete via SECURITY DEFINER RPC; see useLocalProjects.ts
      // for the RLS rationale.
      const { error } = await backend.rpc("soft_delete_report", {
        p_id: args.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      if (args.projectId) {
        queryClient.invalidateQueries({ queryKey: reportsKey(args.projectId) });
      }
    },
  });

  return { create, update, remove };
}
