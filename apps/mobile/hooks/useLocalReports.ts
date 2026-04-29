/**
 * Local-first hooks for reports — list / detail / mutations.
 *
 * Same dual-path pattern as useLocalProjects.ts: when SyncProvider has a
 * local DB ready, repos are used and pushes are triggered. Otherwise the
 * existing `backend.from(...)` cloud paths are used so behavior is
 * unchanged when the flag is off.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { useSyncDb } from "@/lib/sync/SyncProvider";
import {
  createReport as createReportLocal,
  getReport as getReportLocal,
  listReports as listReportsLocal,
  softDeleteReport as softDeleteReportLocal,
  updateReport as updateReportLocal,
  type ReportRow,
  type UpdateReportFields,
} from "@/lib/local-db/repositories/reports-repo";

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
  const queryClient = useQueryClient();
  const { db, onPushComplete } = useSyncDb();
  const isLocalFirst = db !== null;

  useEffect(() => {
    if (!isLocalFirst || !projectId) return;
    return onPushComplete(() => {
      queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
    });
  }, [isLocalFirst, onPushComplete, projectId, queryClient]);

  return useQuery<ListedReport[]>({
    queryKey: [...reportsKey(projectId), isLocalFirst] as const,
    enabled: !!projectId,
    queryFn: async (): Promise<ListedReport[]> => {
      if (!projectId) return [];
      if (isLocalFirst && db) {
        const rows = await listReportsLocal(db, { projectId });
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          report_type: r.report_type,
          status: r.status,
          visit_date: r.visit_date,
          created_at: r.created_at,
        }));
      }
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
  notes: string[];
  report_data: Record<string, unknown>;
  confidence: number | null;
  generation_state?: ReportRow["generation_state"];
  generation_error?: string | null;
};

export function useLocalReport(reportId: string | undefined | null) {
  const queryClient = useQueryClient();
  const { db, onPushComplete } = useSyncDb();
  const isLocalFirst = db !== null;

  useEffect(() => {
    if (!isLocalFirst || !reportId) return;
    return onPushComplete(() => {
      queryClient.invalidateQueries({ queryKey: reportKey(reportId) });
    });
  }, [isLocalFirst, onPushComplete, reportId, queryClient]);

  return useQuery<ReportDetail | null>({
    queryKey: [...reportKey(reportId), isLocalFirst] as const,
    enabled: !!reportId,
    queryFn: async (): Promise<ReportDetail | null> => {
      if (!reportId) return null;
      if (isLocalFirst && db) {
        const row = await getReportLocal(db, reportId);
        if (!row) return null;
        return {
          id: row.id,
          project_id: row.project_id,
          title: row.title,
          report_type: row.report_type,
          status: row.status,
          visit_date: row.visit_date,
          notes: (row.notes as unknown[]).map(String),
          report_data: row.report_data,
          confidence: row.confidence,
          generation_state: row.generation_state,
          generation_error: row.generation_error,
        };
      }
      const { data, error } = await backend
        .from("reports")
        .select(
          "id, project_id, title, report_type, status, visit_date, notes, report_data, confidence",
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
        notes: Array.isArray(data.notes)
          ? (data.notes as unknown[]).map(String)
          : [],
        report_data:
          (data.report_data as Record<string, unknown> | null) ?? {},
        confidence: data.confidence ?? null,
      };
    },
  });
}

export type CreateReportArgs = {
  projectId: string;
  title?: string;
  reportType?: string;
};

export function useLocalReportMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { db, clock, newId, triggerPush, triggerGeneration } = useSyncDb();
  const isLocalFirst = db !== null;

  const create = useMutation({
    mutationFn: async (input: CreateReportArgs): Promise<{ id: string }> => {
      if (!user?.id) throw new Error("Not authenticated");
      if (isLocalFirst && db) {
        const row = await createReportLocal(
          { db, clock, newId },
          {
            projectId: input.projectId,
            ownerId: user.id,
            title: input.title ?? "",
            reportType: input.reportType ?? "daily",
          },
        );
        triggerPush();
        return { id: row.id };
      }
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
      if (isLocalFirst && db) {
        await updateReportLocal({ db, clock, newId }, args.id, args.fields);
        triggerPush();
        // If notes changed, queue a deferred generation pass. The driver
        // gates it on outbox emptiness + voice-note transcription so the
        // job won't actually call the LLM until the new notes are on the
        // server.
        if (Object.prototype.hasOwnProperty.call(args.fields, "notes")) {
          triggerGeneration(args.id);
        }
        return;
      }
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
      if (isLocalFirst && db) {
        await softDeleteReportLocal({ db, clock, newId }, args.id);
        triggerPush();
        return;
      }
      const { error } = await backend
        .from("reports")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", args.id);
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
