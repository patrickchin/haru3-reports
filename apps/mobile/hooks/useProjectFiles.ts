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

type UploadMutationParams = Omit<
  UploadParams,
  "backend" | "uploadedBy" | "body" | "uuid"
> & {
  /** Local file URI to read bytes from. */
  fileUri: string;
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

      const { metadata } = await uploadProjectFile({
        backend,
        uploadedBy: user.id,
        body: bytes,
        ...params,
      });
      return metadata;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: ["project-files", row.project_id],
      });
      if (row.report_id) {
        queryClient.invalidateQueries({
          queryKey: ["project-files", row.project_id, { reportId: row.report_id }],
        });
      }
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
  reportId?: string | null;
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
        reportId: opts.reportId ?? null,
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
      if (opts.reportId !== undefined && opts.reportId !== null) {
        query = query.eq("report_id", opts.reportId);
      }

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
    { fileId: string; storagePath: string; projectId: string }
  >({
    mutationFn: async ({ fileId, storagePath }) => {
      await deleteProjectFile(backend, fileId, storagePath);
    },
    onSuccess: (_void, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["project-files", vars.projectId],
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
