/**
 * Report and note mutations.
 *
 * All mutations follow the server-as-truth pattern: mutate → await → invalidate.
 * No optimistic updates (per design doc §6).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GeneratedSiteReport } from "@harpa/report-core";
import { supabase } from "@/infra/supabase";
import { newId } from "@/infra/ids";
import { reportKeys } from "./queries";

type CreateReportInput = {
  projectId: string;
  title: string;
};

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, title }: CreateReportInput) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("reports")
        .insert({
          id: newId(),
          project_id: projectId,
          owner_id: userId,
          title,
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.byProject(projectId) });
    },
  });
}

type UpdateReportInput = {
  reportId: string;
  projectId: string;
  report: GeneratedSiteReport;
};

export function useUpdateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId, report }: UpdateReportInput) => {
      const { data, error } = await supabase
        .from("reports")
        .update({
          title: report.report.meta.title || "Untitled Report",
          report_data: report,
        })
        .eq("id", reportId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { reportId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.byId(reportId) });
      queryClient.invalidateQueries({ queryKey: reportKeys.byProject(projectId) });
    },
  });
}

type FinalizeReportInput = {
  reportId: string;
  projectId: string;
};

export function useFinalizeReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId }: FinalizeReportInput) => {
      const { data, error } = await supabase
        .from("reports")
        .update({ status: "final" })
        .eq("id", reportId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { reportId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.byId(reportId) });
      queryClient.invalidateQueries({ queryKey: reportKeys.byProject(projectId) });
    },
  });
}

type SoftDeleteReportInput = {
  reportId: string;
  projectId: string;
};

export function useSoftDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId }: SoftDeleteReportInput) => {
      const { data, error } = await supabase
        .from("reports")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", reportId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { reportId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.byId(reportId) });
      queryClient.invalidateQueries({ queryKey: reportKeys.byProject(projectId) });
    },
  });
}

type AddTextNoteInput = {
  reportId: string;
  projectId: string;
  noteText: string;
};

export function useAddTextNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reportId, projectId, noteText }: AddTextNoteInput) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Not authenticated");

      // Auto-assign position: max(position) + 1
      const { data: maxRow, error: maxErr } = await supabase
        .from("report_notes")
        .select("position")
        .eq("report_id", reportId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw maxErr;
      const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 1;

      const { data, error } = await supabase
        .from("report_notes")
        .insert({
          id: newId(),
          report_id: reportId,
          project_id: projectId,
          author_id: userId,
          position: nextPosition,
          kind: "text",
          body: noteText,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.notes(reportId) });
    },
  });
}

type SoftDeleteNoteInput = {
  noteId: string;
  reportId: string;
};

export function useSoftDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId }: SoftDeleteNoteInput) => {
      const { data, error } = await supabase
        .from("report_notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", noteId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: reportKeys.notes(reportId) });
    },
  });
}
