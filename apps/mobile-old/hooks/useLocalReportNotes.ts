/**
 * Report-notes hooks (REST-backed via supabase-js).
 *
 * Each note is one input item to a report (text, voice transcript,
 * image, video, document). Position is dense, 1-based, no required
 * gaps. Names retain `useLocalReportNotes` etc. so the offline-mode
 * v1 removal doesn't churn callers.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { safeRandomUUID } from "@/lib/uuid";

export type NoteKind = "text" | "voice" | "image" | "video" | "document";

export type ReportNoteRow = {
  id: string;
  report_id: string;
  project_id: string;
  author_id: string;
  position: number;
  kind: NoteKind;
  body: string | null;
  file_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  isOptimistic?: boolean;
};

const NOTE_COLS =
  "id, report_id, project_id, author_id, position, kind, body, file_id, deleted_at, created_at, updated_at";

export function reportNotesKey(reportId: string | undefined | null) {
  return ["report-notes", reportId ?? null] as const;
}

export function useLocalReportNotes(reportId: string | undefined | null) {
  return useQuery<ReportNoteRow[]>({
    queryKey: reportNotesKey(reportId),
    enabled: !!reportId,
    queryFn: async () => {
      if (!reportId) return [];
      const { data, error } = await backend
        .from("report_notes")
        .select(NOTE_COLS)
        .eq("report_id", reportId)
        .order("position", { ascending: true });
      if (error) throw error;
      // SELECT policy already filters deleted_at IS NULL, but keep the
      // client-side guard for safety in case a future policy relaxes it.
      return ((data ?? []) as ReportNoteRow[]).filter(
        (r) => r.deleted_at === null,
      );
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
  return useQuery<ReadonlySet<string>>({
    queryKey: ["report-notes-other-file-ids", projectId ?? null, reportId ?? null],
    enabled: !!projectId && !!reportId,
    queryFn: async () => {
      if (!projectId || !reportId) return new Set<string>();
      const { data, error } = await backend
        .from("report_notes")
        .select("file_id")
        .eq("project_id", projectId)
        .neq("report_id", reportId)
        .not("file_id", "is", null);
      if (error) throw error;
      const ids = new Set<string>();
      for (const row of data ?? []) {
        const fid = (row as { file_id: string | null }).file_id;
        if (fid) ids.add(fid);
      }
      return ids;
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

type CreateReportNoteContext = {
  queryKey: ReturnType<typeof reportNotesKey>;
  previous: ReportNoteRow[] | undefined;
  wasCached: boolean;
  hadServerRows: boolean;
  optimisticId: string | null;
};

export function useReportNotesMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const create = useMutation({
    mutationFn: async (
      input: CreateReportNoteArgs,
    ): Promise<ReportNoteRow | null> => {
      if (!user?.id) throw new Error("Not authenticated");

      // Auto-assign position: max(position) + 1 for live notes on this
      // report. Two concurrent inserts on the same report can collide on
      // the (report_id, position) unique constraint added in
      // 202605010006_report_notes_position_unique; that's acceptable —
      // the second insert errors and the caller can retry.
      const { data: maxRow, error: maxErr } = await backend
        .from("report_notes")
        .select("position")
        .eq("report_id", input.reportId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) throw maxErr;
      const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 1;

      const { data, error } = await backend
        .from("report_notes")
        .insert({
          report_id: input.reportId,
          project_id: input.projectId,
          author_id: user.id,
          position: nextPosition,
          kind: input.kind,
          body: input.body ?? null,
          file_id: input.fileId ?? null,
        })
        .select(NOTE_COLS)
        .single();
      if (error) throw error;
      return data as ReportNoteRow;
    },
    onMutate: async (input): Promise<CreateReportNoteContext> => {
      const queryKey = reportNotesKey(input.reportId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ReportNoteRow[]>(queryKey);
      const wasCached = previous !== undefined;
      const hadServerRows = (previous ?? []).some((row) => !row.isOptimistic);

      if (input.kind !== "text" || !user?.id) {
        return { queryKey, previous, wasCached, hadServerRows, optimisticId: null };
      }

      const now = new Date().toISOString();
      const optimisticId = safeRandomUUID();
      const rows = previous ?? [];
      const nextPosition =
        rows.reduce((max, row) => Math.max(max, row.position), 0) + 1;
      const optimisticRow: ReportNoteRow = {
        id: optimisticId,
        report_id: input.reportId,
        project_id: input.projectId,
        author_id: user.id,
        position: nextPosition,
        kind: "text",
        body: input.body ?? null,
        file_id: null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
        isOptimistic: true,
      };

      queryClient.setQueryData<ReportNoteRow[]>(queryKey, [
        ...rows,
        optimisticRow,
      ]);

      return { queryKey, previous, wasCached, hadServerRows, optimisticId };
    },
    onError: (_error, _input, context) => {
      if (!context?.optimisticId) return;
      queryClient.setQueryData<ReportNoteRow[]>(context.queryKey, (current) => {
        const next = (current ?? []).filter(
          (row) => row.id !== context.optimisticId,
        );
        return next;
      });
      const remaining = queryClient.getQueryData<ReportNoteRow[]>(context.queryKey);
      const hasRemainingServerRows = (remaining ?? []).some(
        (row) => !row.isOptimistic,
      );
      const hadOnlyOptimisticRows =
        context.wasCached
        && (context.previous?.length ?? 0) > 0
        && !context.hadServerRows;
      const shouldRemoveEmptyOptimisticCache =
        (remaining?.length ?? 0) === 0
        && !hasRemainingServerRows
        && (!context.wasCached || hadOnlyOptimisticRows);
      if (shouldRemoveEmptyOptimisticCache) {
        queryClient.removeQueries({ queryKey: context.queryKey, exact: true });
      }
    },
    onSuccess: (row, input, context) => {
      if (row && context?.optimisticId) {
        queryClient.setQueryData<ReportNoteRow[]>(context.queryKey, (current) => {
          const rows = current ?? [];
          let replaced = false;
          const next = rows.map((existing) => {
            if (existing.id !== context.optimisticId) return existing;
            replaced = true;
            return row;
          });
          return replaced ? next : [...rows, row];
        });
      }
      queryClient.invalidateQueries({
        queryKey: reportNotesKey(input.reportId),
      });
    },
  });

  const remove = useMutation({
    mutationFn: async (input: {
      id: string;
      reportId: string;
    }): Promise<void> => {
      // Soft-delete via SECURITY DEFINER RPC. Direct
      // `update({ deleted_at })` against `report_notes` fails RLS
      // (42501); see supabase/migrations/202605070001_soft_delete_report_note.sql.
      const { error } = await backend.rpc("soft_delete_report_note", {
        p_id: input.id,
      });
      if (error) throw error;
    },
    onSuccess: (_v, input) => {
      queryClient.invalidateQueries({
        queryKey: reportNotesKey(input.reportId),
      });
    },
  });

  return { create, remove };
}
