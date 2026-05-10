/**
 * React Query hooks for reports and notes.
 *
 * Server-as-truth pattern: no optimistic updates by default (per design doc §6).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/infra/supabase";
import type { SiteReport, ReportNote } from "@/infra/db-types";

export const reportKeys = {
  all: ["reports"] as const,
  byProject: (pid: string) => [...reportKeys.all, "project", pid] as const,
  byId: (rid: string) => [...reportKeys.all, "id", rid] as const,
  notes: (rid: string) => [...reportKeys.byId(rid), "notes"] as const,
};

export function useReports(projectId: string | null) {
  return useQuery<SiteReport[]>({
    queryKey: reportKeys.byProject(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SiteReport[];
    },
  });
}

export function useReport(reportId: string | null) {
  return useQuery<SiteReport | null>({
    queryKey: reportKeys.byId(reportId ?? ""),
    enabled: !!reportId,
    queryFn: async () => {
      if (!reportId) return null;
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (error) throw error;
      return data as SiteReport | null;
    },
  });
}

export function useReportNotes(reportId: string | null) {
  return useQuery<ReportNote[]>({
    queryKey: reportKeys.notes(reportId ?? ""),
    enabled: !!reportId,
    queryFn: async () => {
      if (!reportId) return [];
      const { data, error } = await supabase
        .from("report_notes")
        .select("*")
        .eq("report_id", reportId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReportNote[];
    },
  });
}
