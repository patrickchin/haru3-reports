import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { backend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import {
  PROJECT_FILES_BUCKET,
  deleteProjectFile,
  getSignedUrl,
  uploadProjectFile,
  type FileMetadataRow,
  type UploadParams,
} from "@/lib/file-upload";
import type { FileCategory } from "@/lib/file-validation";
import { prefetchImages } from "@/lib/image-cache";

type UploadMutationParams = Omit<
  UploadParams,
  "backend" | "uploadedBy" | "body" | "uuid" | "thumbnail"
> & {
  /** Local file URI to read bytes from. */
  fileUri: string;
  /** Optional local thumbnail URI (Phase 1 image-perf). */
  thumbnailUri?: string | null;
  /** Optional thumbnail mime type (defaults to `image/jpeg`). */
  thumbnailMimeType?: string | null;
};

/**
 * TanStack mutation that wraps `uploadProjectFile`.
 *
 * Reads bytes from the local URI via `expo-file-system`, then runs the
 * pure upload pipeline. Invalidates the file list query on success.
 */
export function useFileUpload() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<FileMetadataRow, Error, UploadMutationParams>({
    mutationFn: async (params) => {
      if (!user) throw new Error("Not authenticated");

      const bytes = await readBytes(params.fileUri);
      const { thumbnailUri, thumbnailMimeType, ...rest } = params;
      let thumbnail: UploadParams["thumbnail"] = null;
      if (thumbnailUri) {
        const thumbBytes = await readBytes(thumbnailUri);
        thumbnail = {
          body: thumbBytes,
          mimeType: thumbnailMimeType ?? "image/jpeg",
          sizeBytes: thumbBytes.byteLength,
        };
      }

      const { metadata } = await uploadProjectFile({
        backend,
        uploadedBy: user.id,
        body: bytes,
        thumbnail,
        ...rest,
      });
      return metadata;
    },
    onSuccess: async (row) => {
      // Seed signed-URL query cache so the FileCard / CachedImage that
      // mounts immediately after upload doesn't trigger a fresh round-trip
      // to Supabase Storage. Best-effort: a failure here just falls back
      // to the normal lazy fetch path.
      try {
        // Seed the full-asset signed URL.
        const url = await getSignedUrl(backend, row.storage_path);
        queryClient.setQueryData(
          ["project-file-signed-url", row.storage_path],
          url,
        );
        // For images, FileCard renders from the thumbnail signed URL —
        // seed that too and warm expo-image's disk cache so the photo
        // strip doesn't flash a placeholder after upload.
        if (row.category === "image") {
          const urlsToPrefetch: string[] = [url];
          if (row.thumbnail_path) {
            try {
              const thumbUrl = await getSignedUrl(backend, row.thumbnail_path);
              queryClient.setQueryData(
                ["project-file-signed-url", row.thumbnail_path],
                thumbUrl,
              );
              urlsToPrefetch.push(thumbUrl);
            } catch {
              // ignore — full URL prefetch is enough
            }
          }
          await prefetchImages(urlsToPrefetch);
        }
      } catch {
        // ignore — purely an optimization
      }
      queryClient.invalidateQueries({
        queryKey: ["project-files", row.project_id],
      });
    },
  });
}

/**
 * Query the list of files for a project, optionally filtered by category
 * and/or report.
 */
export function useProjectFiles(opts: {
  projectId: string | null | undefined;
  category?: FileCategory;
  excludeCategory?: FileCategory;
  enabled?: boolean;
}) {
  const enabled = (opts.enabled ?? true) && !!opts.projectId;

  return useQuery<FileMetadataRow[]>({
    queryKey: [
      "project-files",
      opts.projectId,
      {
        category: opts.category ?? null,
        excludeCategory: opts.excludeCategory ?? null,
      },
    ],
    enabled,
    queryFn: async () => {
      let query = backend
        .from("file_metadata")
        .select("*")
        .eq("project_id", opts.projectId!)
        .order("created_at", { ascending: false });

      if (opts.category) query = query.eq("category", opts.category);
      if (opts.excludeCategory) query = query.neq("category", opts.excludeCategory);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FileMetadataRow[];
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      fileId: string;
      storagePath: string;
      projectId: string;
      thumbnailPath?: string | null;
    }
  >({
    mutationFn: async ({ fileId, storagePath, thumbnailPath }) => {
      await deleteProjectFile(backend, fileId, storagePath, thumbnailPath ?? null);
    },
    onSuccess: (_void, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["project-files", vars.projectId],
      });
      // Report notes linked to this file were soft-deleted on the server;
      // invalidate so the timeline drops the orphaned transcript.
      queryClient.invalidateQueries({
        queryKey: ["report-notes"],
      });
    },
  });
}

/** Get a 1-hour signed URL for a private file. Cached briefly to dedupe taps. */
export function useFileSignedUrl(storagePath: string | null | undefined) {
  return useQuery<string>({
    queryKey: ["project-file-signed-url", storagePath],
    enabled: !!storagePath,
    staleTime: 30 * 60 * 1000, // 30 min — signed URLs valid 1h
    queryFn: () => getSignedUrl(backend, storagePath!),
  });
}

// ---------- helpers ----------

async function readBytes(uri: string): Promise<Uint8Array> {
  // expo-file-system 55+ exposes readAsStringAsync with EncodingType.Base64.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToUint8Array(base64);
}

function base64ToUint8Array(b64: string): Uint8Array {
  // React Native does not have atob globally before iOS 16/Android 14.
  // Use a minimal fallback that's also fast enough for files up to 50 MB.
  const decoded =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

export { PROJECT_FILES_BUCKET };
