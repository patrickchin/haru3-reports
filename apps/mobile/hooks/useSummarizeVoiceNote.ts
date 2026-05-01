import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";

/**
 * Threshold above which a voice-note transcript is worth summarizing.
 *
 * Below this, the full transcript already fits in a few collapsed lines on
 * the card and a separate summary would just add visual noise. 400 chars is
 * roughly 60-80 spoken words / 30 seconds of speech.
 */
export const LONG_TRANSCRIPT_CHAR_THRESHOLD = 400;

/**
 * Mutation key used both for the mutation registration and the
 * `isMutating({ mutationKey: [..., fileId] })` check that lets every
 * `VoiceNoteCard` instance see in-flight summarize calls fired by sibling
 * cards for the same file. Keying by fileId means concurrent siblings
 * (e.g. compose tab + report list both showing the same voice note) only
 * trigger the edge function once.
 */
export const SUMMARIZE_VOICE_NOTE_MUTATION_KEY = "summarize-voice-note" as const;

export type SummarizeVoiceNoteInput = {
  fileId: string;
  transcript: string;
  /** projectId is used for query invalidation, not sent to the edge function. */
  projectId?: string | null;
};

export type SummarizeVoiceNoteResult = {
  title: string;
  summary: string;
};

/**
 * TanStack mutation that calls the `summarize-voice-note` edge function.
 *
 * The edge function writes `voice_title` + `voice_summary` to
 * `file_metadata` server-side; the next sync pull will hydrate the new
 * columns into local SQLite. We also invalidate the project-files query
 * here so the UI refreshes immediately on success — without waiting for
 * the next pull cycle.
 *
 * The mutation key includes the fileId so callers can use
 * `useIsSummarizingFile(fileId)` to detect in-flight calls fired by
 * sibling components and avoid duplicate work.
 */
export function useSummarizeVoiceNote() {
  const queryClient = useQueryClient();
  return useMutation<
    SummarizeVoiceNoteResult,
    Error,
    SummarizeVoiceNoteInput
  >({
    mutationKey: [SUMMARIZE_VOICE_NOTE_MUTATION_KEY],
    mutationFn: async ({ fileId, transcript }) => {
      const trimmed = transcript.trim();
      if (!trimmed) {
        throw new Error("Cannot summarize an empty transcript.");
      }
      const { data, error } = await backend.functions.invoke<
        SummarizeVoiceNoteResult
      >("summarize-voice-note", {
        body: { fileId, transcript: trimmed },
      });
      if (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Summarize failed: ${message}`);
      }
      if (
        !data || typeof data.title !== "string" ||
        typeof data.summary !== "string"
      ) {
        throw new Error("Summarize returned an unexpected response shape.");
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      if (vars.projectId) {
        queryClient.invalidateQueries({
          queryKey: ["project-files", vars.projectId],
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["project-files"] });
      }
    },
  });
}

/**
 * True when any `useSummarizeVoiceNote` mutation is currently in-flight
 * for `fileId`. Used by `VoiceNoteCard`'s auto-summarize effect so that
 * concurrent sibling cards for the same file_id only fire one edge
 * function call between them.
 */
export function useIsSummarizingFile(fileId: string): boolean {
  const queryClient = useQueryClient();
  return queryClient.isMutating({
    mutationKey: [SUMMARIZE_VOICE_NOTE_MUTATION_KEY],
    predicate: (mutation) => {
      const vars = mutation.state.variables as
        | SummarizeVoiceNoteInput
        | undefined;
      return vars?.fileId === fileId;
    },
  }) > 0;
}
