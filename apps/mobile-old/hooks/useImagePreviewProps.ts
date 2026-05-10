import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFileSignedUrl } from "@/hooks/useProjectFiles";
import type { FileMetadataRow } from "@/lib/file-upload";

export interface ImagePreviewModalProps {
  uri: string | null;
  cacheKey: string | undefined;
  intrinsicWidth: number | null | undefined;
  intrinsicHeight: number | null | undefined;
  placeholderUri: string | null;
  blurhash: string | null;
  prefetchUris: ReadonlyArray<string>;
}

/**
 * Resolves Phase 2 modal props (full-res signed URL, placeholder
 * thumbnail signed URL, adjacent-image prefetch URLs) for a focused
 * image.
 *
 * The full-res `uri` is resolved asynchronously: the hook returns
 * `null` immediately so callers can open the modal synchronously and
 * show a loading state while the signed URL fetch is in flight. When
 * the URL is already in the TanStack cache (typically because the
 * FileCard's render-time prefetch ran), the resolution is effectively
 * synchronous on the next React tick.
 *
 * `adjacentFiles` lets the caller pass siblings from the same gallery so
 * the modal can warm the cache for the next/previous photos. Their
 * signed URLs are best-effort: cache hits use whatever the
 * `project-file-signed-url` TanStack query already has; misses are
 * skipped silently.
 */
export function useImagePreviewProps(
  file: FileMetadataRow | null,
  adjacentFiles: ReadonlyArray<FileMetadataRow> = [],
): ImagePreviewModalProps {
  const queryClient = useQueryClient();

  const thumbnailPath = file?.thumbnail_path ?? null;
  const storagePath = file?.storage_path ?? null;
  const { data: placeholderUri } = useFileSignedUrl(thumbnailPath);
  const { data: uri } = useFileSignedUrl(storagePath);

  const prefetchUris = useMemo<ReadonlyArray<string>>(() => {
    return adjacentFiles
      .map((adjacent) => {
        const cached = queryClient.getQueryData<string>([
          "project-file-signed-url",
          adjacent.storage_path,
        ]);
        return cached ?? null;
      })
      .filter((u): u is string => typeof u === "string" && u.length > 0);
  }, [adjacentFiles, queryClient]);

  return {
    uri: uri ?? null,
    cacheKey: file?.storage_path,
    intrinsicWidth: file?.width,
    intrinsicHeight: file?.height,
    placeholderUri: placeholderUri ?? null,
    blurhash: file?.blurhash ?? null,
    prefetchUris,
  };
}
