import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import {
  createCameraSession,
  consumeCameraSession,
} from "@/lib/camera-session-registry";
import { getUploadQueue, type EnqueueInput, type UploadKind } from "@/lib/uploads";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { type PendingPhotoItem } from "@/hooks/useNoteTimeline";
import { reportNotesKey } from "@/hooks/useLocalReportNotes";
import { pickProjectFile } from "@/lib/pick-project-file";
import { type FileCategory } from "@/lib/file-validation";

async function getFileSize(uri: string, fallback: number | undefined): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info && typeof info.size === "number") {
      return info.size;
    }
  } catch {
    // ignore — fall through to fallback
  }
  return fallback ?? 0;
}

// Avatars and voice notes never come through this screen's picker (the
// avatar flow lives elsewhere; voice notes use a recorder + transcription
// pipeline that isn't part of the upload queue).
function kindForCategory(
  category: Exclude<FileCategory, "avatar" | "voice-note">,
): UploadKind {
  switch (category) {
    case "image":
      return "project-image";
    case "document":
    case "attachment":
      return "document";
    case "icon":
      return "document";
  }
}

const stripQueuePrefix = (localId: string): string | null =>
  localId.startsWith("queue-") ? localId.slice("queue-".length) : null;

interface UsePhotoUploadPipelineArgs {
  projectId: string | undefined;
  reportId: string | undefined;
  userId: string | undefined;
  notesScrollRef: React.RefObject<ScrollView | null>;
  onUploadError: (message: string) => void;
}

export function usePhotoUploadPipeline({
  projectId,
  reportId,
  userId,
  notesScrollRef,
  onUploadError,
}: UsePhotoUploadPipelineArgs) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const uploadQueue = useMemo(() => getUploadQueue(), []);
  const { jobs: uploadJobs } = useUploadQueue({ queue: uploadQueue });
  const seenCompletedUploadJobIdsRef = useRef<ReadonlySet<string>>(new Set());

  // When a queue job for this report transitions to "uploaded", refresh
  // the report-notes + project-files caches so the file row appears in
  // the timeline.
  useEffect(() => {
    if (!projectId || !reportId) return;

    let nextSeen: Set<string> | null = null;
    let shouldRefresh = false;
    for (const job of uploadJobs) {
      if (job.state !== "uploaded") continue;
      if (job.input.projectId !== projectId) continue;
      if (job.input.reportId !== reportId) continue;
      const seen = nextSeen ?? seenCompletedUploadJobIdsRef.current;
      if (seen.has(job.id)) continue;

      nextSeen ??= new Set(seenCompletedUploadJobIdsRef.current);
      nextSeen.add(job.id);
      shouldRefresh = true;
    }

    if (!shouldRefresh) return;
    seenCompletedUploadJobIdsRef.current = nextSeen ?? seenCompletedUploadJobIdsRef.current;
    queryClient.invalidateQueries({ queryKey: reportNotesKey(reportId) });
    queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
  }, [uploadJobs, projectId, queryClient, reportId]);

  // Project queue jobs into the existing PendingPhotoItem shape so the
  // timeline can render optimistic rows directly off the queue's state.
  const queuePendingPhotos = useMemo<readonly PendingPhotoItem[]>(() => {
    if (!projectId || !reportId) return [];
    const items: PendingPhotoItem[] = [];
    for (const job of uploadJobs) {
      if (job.input.category !== "image") continue;
      if (job.input.projectId !== projectId) continue;
      if (job.input.reportId !== reportId) continue;
      if (job.state === "cancelled") continue;
      // Keep `uploaded` jobs in the pending list as long as they still
      // have a fileId — useNoteTimeline uses that fileId to bridge the
      // pending row → file row across the swap (same React key + same
      // sort timestamp), preventing the visible content shift while the
      // report_notes link query is still in flight.
      if (job.state === "uploaded" && !job.fileId) continue;
      const localUri = job.workingUri ?? job.input.sourceUri;
      const thumbnailUri = job.thumbnailUri ?? localUri;
      items.push({
        localId: `queue-${job.id}`,
        localUri,
        thumbnailUri,
        addedAt: job.createdAt,
        status: job.state === "failed" ? "failed" : "uploading",
        error: job.lastError,
        fileId: job.fileId,
      });
    }
    return items;
  }, [uploadJobs, projectId, reportId]);

  const enqueueProjectUpload = useCallback(
    (
      category: Exclude<FileCategory, "avatar" | "voice-note">,
      file: {
        fileUri: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        width?: number | null;
        height?: number | null;
      },
    ): string | null => {
      if (!projectId || !reportId || !userId) return null;
      const input: EnqueueInput = {
        kind: kindForCategory(category),
        sourceUri: file.fileUri,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        projectId,
        reportId,
        uploadedBy: userId,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
        category,
        isImage: category === "image",
      };
      return uploadQueue.enqueueUpload(input);
    },
    [projectId, reportId, userId, uploadQueue],
  );

  const handleMenuPick = useCallback(
    async (category: Exclude<FileCategory, "avatar" | "voice-note">) => {
      if (!projectId || !reportId) return;
      try {
        const result = await pickProjectFile(category);
        if (result.kind === "canceled") return;
        if (result.kind === "error") {
          onUploadError(result.message);
          return;
        }
        // Per-row failure surfaces as a failed chip in the timeline
        // via the queue projection above. The dialog is reserved for
        // picker-level errors (permission denied, picker crash, etc.)
        // since those have no row to attach a chip to.
        enqueueProjectUpload(category, result.file);
      } catch (err) {
        onUploadError(err instanceof Error ? err.message : "Could not pick file");
      }
    },
    [projectId, reportId, enqueueProjectUpload, onUploadError],
  );

  // Reference to the most recently launched camera session. We drain it
  // on focus return rather than wiring a callback through router params.
  const cameraSessionIdRef = useRef<string | null>(null);

  const enqueueCapturedPhoto = useCallback(
    async (uri: string) => {
      if (!projectId || !reportId) return;
      try {
        const sizeBytes = await getFileSize(uri, undefined);
        enqueueProjectUpload("image", {
          fileUri: uri,
          filename: `photo-${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes,
        });
      } catch (err) {
        onUploadError(err instanceof Error ? err.message : "Could not import photo");
      }
    },
    [projectId, reportId, enqueueProjectUpload, onUploadError],
  );

  // Drain the camera-session registry whenever this screen regains focus.
  // `consumeCameraSession` is single-use so re-focusing for any other
  // reason is a cheap no-op.
  useFocusEffect(
    useCallback(() => {
      const id = cameraSessionIdRef.current;
      if (!id) return;
      cameraSessionIdRef.current = null;
      const uris = consumeCameraSession(id);
      if (!uris || uris.length === 0) return;
      // Fire-and-forget; each photo enqueues independently so a slow
      // preprocess on shot N+1 does not block shot N's UI insertion.
      void (async () => {
        for (const uri of uris) {
          await enqueueCapturedPhoto(uri);
        }
        setTimeout(
          () => notesScrollRef.current?.scrollTo({ y: 0, animated: true }),
          100,
        );
      })();
    }, [enqueueCapturedPhoto, notesScrollRef]),
  );

  const handleCameraCapture = useCallback(() => {
    if (!projectId || !reportId) return;
    const sessionId = createCameraSession({
      returnTo: `/projects/${projectId}/reports/generate`,
      context: { projectId, reportId },
    });
    cameraSessionIdRef.current = sessionId;
    router.push({
      pathname: "/(camera)/capture",
      params: { sessionId },
    });
  }, [projectId, reportId, router]);

  const handleRetryPendingPhoto = useCallback(
    (localId: string) => {
      const jobId = stripQueuePrefix(localId);
      if (!jobId) return;
      uploadQueue.retryUpload(jobId);
    },
    [uploadQueue],
  );

  const handleDiscardPendingPhoto = useCallback(
    (localId: string) => {
      const jobId = stripQueuePrefix(localId);
      if (!jobId) return;
      uploadQueue.cancelUpload(jobId);
    },
    [uploadQueue],
  );

  return {
    queuePendingPhotos,
    handleMenuPick,
    handleCameraCapture,
    handleRetryPendingPhoto,
    handleDiscardPendingPhoto,
  } as const;
}
