/**
 * Local-first hook for report_notes — list + create + delete.
 *
 * report_notes is the source of truth for a report's note inputs (text,
 * voice transcripts, image / document attachments). Notes are written
 * straight through to local SQLite via the report-notes-repo and pushed
 * to the server through the outbox.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { useSyncDb } from "@/lib/sync/SyncProvider";
import {
  createNote as createNoteLocal,
  deleteNote as deleteNoteLocal,
  listNotes as listNotesLocal,
  listOtherReportFileIds as listOtherReportFileIdsLocal,
  type NoteKind,
  type ReportNoteRow,
} from "@/lib/local-db/repositories/report-notes-repo";

function reportNotesKey(reportId: string | undefined | null) {
  return ["report-notes", reportId ?? null] as const;
}

export function useLocalReportNotes(reportId: string | undefined | null) {
  const queryClient = useQueryClient();
  const { db, onPushComplete, onPullComplete } = useSyncDb();
  const isLocalFirst = db !== null;

  useEffect(() => {
    if (!isLocalFirst || !reportId) return;
    return onPushComplete(() => {
      queryClient.invalidateQueries({ queryKey: reportNotesKey(reportId) });
    });
  }, [isLocalFirst, onPushComplete, reportId, queryClient]);

  useEffect(() => {
    if (!isLocalFirst || !reportId) return;
    return onPullComplete((evt) => {
      if (evt.tablesApplied.includes("report_notes")) {
        queryClient.invalidateQueries({ queryKey: reportNotesKey(reportId) });
      }
    });
  }, [isLocalFirst, onPullComplete, reportId, queryClient]);

  return useQuery<ReportNoteRow[]>({
    queryKey: [...reportNotesKey(reportId), isLocalFirst] as const,
    enabled: !!reportId && isLocalFirst,
    queryFn: async () => {
      if (!reportId || !db) return [];
      return listNotesLocal(db, { reportId });
    },
  });
}

/**
 * Returns the set of `file_metadata.id` values that are linked to
 * `report_notes` in the same project but a *different* report than
 * `reportId`. Used by the timeline to exclude files claimed by other
 * reports.
 */
export function useOtherReportFileIds(
  projectId: string | undefined | null,
  reportId: string | undefined | null,
) {
  const queryClient = useQueryClient();
  const { db, onPushComplete, onPullComplete } = useSyncDb();
  const isLocalFirst = db !== null;

  const queryKey = ["report-notes-other-file-ids", projectId ?? null, reportId ?? null] as const;

  useEffect(() => {
    if (!isLocalFirst || !projectId || !reportId) return;
    return onPushComplete(() => {
      queryClient.invalidateQueries({ queryKey });
    });
  }, [isLocalFirst, onPushComplete, projectId, reportId, queryClient, queryKey]);

  useEffect(() => {
    if (!isLocalFirst || !projectId || !reportId) return;
    return onPullComplete((evt) => {
      if (evt.tablesApplied.includes("report_notes")) {
        queryClient.invalidateQueries({ queryKey });
      }
    });
  }, [isLocalFirst, onPullComplete, projectId, reportId, queryClient, queryKey]);

  return useQuery<ReadonlySet<string>>({
    queryKey: [...queryKey, isLocalFirst] as const,
    enabled: !!projectId && !!reportId && isLocalFirst,
    queryFn: async () => {
      if (!projectId || !reportId || !db) return new Set<string>();
      const ids = await listOtherReportFileIdsLocal(db, {
        projectId,
        excludeReportId: reportId,
      });
      return new Set(ids);
    },
  });
}

export type CreateReportNoteArgs = {
  reportId: string;
  projectId: string;
  kind: NoteKind;
  body?: string | null;
  fileId?: string | null;
};

export function useReportNotesMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { db, clock, newId, triggerPush } = useSyncDb();
  const isLocalFirst = db !== null;

  const create = useMutation({
    mutationFn: async (input: CreateReportNoteArgs): Promise<ReportNoteRow | null> => {
      if (!isLocalFirst || !db) return null;
      if (!user?.id) throw new Error("Not authenticated");
      const row = await createNoteLocal(
        { db, clock, newId },
        {
          reportId: input.reportId,
          projectId: input.projectId,
          authorId: user.id,
          kind: input.kind,
          body: input.body ?? null,
          fileId: input.fileId ?? null,
        },
      );
      triggerPush();
      return row;
    },
    onSuccess: (_row, input) => {
      queryClient.invalidateQueries({ queryKey: reportNotesKey(input.reportId) });
    },
  });

  const remove = useMutation({
    mutationFn: async (input: { id: string; reportId: string }): Promise<void> => {
      if (!isLocalFirst || !db) return;
      await deleteNoteLocal({ db, clock, newId }, input.id);
      triggerPush();
    },
    onSuccess: (_v, input) => {
      queryClient.invalidateQueries({ queryKey: reportNotesKey(input.reportId) });
    },
  });

  return { create, remove };
}
