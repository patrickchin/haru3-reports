/**
 * Voice note pipeline hook.
 *
 * Orchestrates: record → enqueue upload → wait for upload complete →
 * transcribe → maybe summarize → optimistic merge into cache.
 *
 * The optimistic merge after summarize is MANDATORY per 2026-05-08 bug fix.
 */
import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { getUploadQueue } from "@/features/uploads/queue";
import { transcribeAudio } from "./transcribe";
import { summarizeVoiceNote } from "./summarize";
import { supabase } from "@/infra/supabase";
import { reportKeys } from "@/features/reports";
import { newId } from "@/infra/ids";
import type { FileMetadata } from "@/infra/db-types";

const LONG_TRANSCRIPT_CHAR_THRESHOLD = 400;

export type VoicePipelineInput = {
  audioUri: string;
  durationMs: number;
  projectId: string;
  reportId?: string;
  uploaderId: string;
};

export type VoicePipelineResult = {
  fileId: string;
  transcript: string;
  summary?: { title: string; summary: string };
};

export function useVoicePipeline() {
  const queryClient = useQueryClient();
  const uploadQueue = getUploadQueue();

  return useMutation({
    mutationFn: async (input: VoicePipelineInput): Promise<VoicePipelineResult> => {
      const fileId = Crypto.randomUUID();
      const filename = `voice-note-${Date.now()}.m4a`;

      // 1. Enqueue upload
      const jobId = uploadQueue.enqueueUpload({
        sourceUri: input.audioUri,
        projectId: input.projectId,
        reportId: input.reportId,
        fileId,
        kind: "voice",
        isImage: false,
        filename,
        mimeType: "audio/m4a",
        sizeBytes: 0, // Size unknown until upload, preprocess will determine actual size
        durationMs: input.durationMs,
        uploadedBy: input.uploaderId,
      });

      // 2. Wait for upload to complete
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = uploadQueue.subscribe(() => {
          const job = uploadQueue.getJob(jobId);
          if (!job) {
            unsubscribe();
            reject(new Error("Upload job vanished"));
            return;
          }
          if (job.state === "uploaded") {
            unsubscribe();
            resolve();
          }
          if (job.state === "failed") {
            unsubscribe();
            reject(new Error(job.lastError || "Upload failed"));
          }
        });
      });

      // 3. Transcribe
      const { transcript } = await transcribeAudio(input.audioUri);

      // Write transcript to report_notes.body (transcripts now live there per migration 202604300003)
      if (input.reportId) {
        // Find or create report_notes row for this voice file
        const { data: existingNote } = await supabase
          .from("report_notes")
          .select("id")
          .eq("file_id", fileId)
          .maybeSingle();

        if (existingNote) {
          // Update existing note with transcript
          const { error: updateError } = await supabase
            .from("report_notes")
            .update({ body: transcript })
            .eq("id", existingNote.id);
          if (updateError) {
            throw new Error(`Failed to update transcript: ${updateError.message}`);
          }
        } else {
          // Create new report_notes row
          const { data: maxRow } = await supabase
            .from("report_notes")
            .select("position")
            .eq("report_id", input.reportId)
            .is("deleted_at", null)
            .order("position", { ascending: false })
            .limit(1)
            .maybeSingle();
          const nextPosition = ((maxRow?.position as number | undefined) ?? 0) + 1;

          const { error: insertError } = await supabase
            .from("report_notes")
            .insert({
              id: newId(),
              report_id: input.reportId,
              project_id: input.projectId,
              author_id: input.uploaderId,
              position: nextPosition,
              kind: "voice",
              body: transcript,
              file_id: fileId,
            });
          if (insertError) {
            throw new Error(`Failed to create note with transcript: ${insertError.message}`);
          }
        }
      }

      // 4. Maybe summarize (if transcript is long enough)
      let summary: { title: string; summary: string } | undefined;
      if (transcript.length >= LONG_TRANSCRIPT_CHAR_THRESHOLD) {
        summary = await summarizeVoiceNote(fileId, transcript);

        // Write summary to file_metadata
        const { error: summaryError } = await supabase
          .from("file_metadata")
          .update({
            voice_title: summary.title,
            voice_summary: summary.summary,
          })
          .eq("id", fileId);

        if (summaryError) {
          throw new Error(`Failed to write summary: ${summaryError.message}`);
        }

        // 5. OPTIMISTIC MERGE: update all cached file_metadata rows matching fileId
        // This ensures the summary is immediately visible without refetch (R3 fix).
        optimisticMergeSummaryIntoCache(queryClient, fileId, summary);

        // 6. INVALIDATE: refetch report_notes to get authoritative data with updated file_metadata
        if (input.reportId) {
          await queryClient.invalidateQueries({ queryKey: reportKeys.notes(input.reportId) });
        }
      }

      return { fileId, transcript, summary };
    },
  });
}

/**
 * Optimistically merge voice_title + voice_summary into all cached queries
 * that contain a file_metadata row with the given fileId.
 *
 * This is the 2026-05-08 bug guardrail (R11). Must be tested.
 */
function optimisticMergeSummaryIntoCache(
  queryClient: ReturnType<typeof useQueryClient>,
  fileId: string,
  summary: { title: string; summary: string }
) {
  const queries = queryClient.getQueryCache().getAll();

  for (const query of queries) {
    const data = query.state.data;
    if (!data) continue;

    // Handle array of FileMetadata
    if (Array.isArray(data)) {
      const updated = data.map((row) =>
        isFileMetadataRow(row) && row.id === fileId
          ? { ...row, voice_title: summary.title, voice_summary: summary.summary }
          : row
      );
      if (updated !== data) {
        queryClient.setQueryData(query.queryKey, updated);
      }
    }

    // Handle single FileMetadata
    if (isFileMetadataRow(data) && data.id === fileId) {
      queryClient.setQueryData(query.queryKey, {
        ...data,
        voice_title: summary.title,
        voice_summary: summary.summary,
      });
    }
  }
}

function isFileMetadataRow(value: unknown): value is FileMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "storage_path" in value &&
    "mime_type" in value
  );
}
