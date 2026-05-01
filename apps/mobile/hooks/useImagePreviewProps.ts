import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import { getSignedUrl, type FileMetadataRow } from "@/lib/file-upload";

const SIGNED_URL_STALE_MS = 30 * 60 * 1000;

export interface ImagePreviewModalProps {
  cacheKey: string | undefined;
  intrinsicWidth: number | null | undefined;
  intrinsicHeight: number | null | undefined;
  placeholderUri: string | null;
  blurhash: string | null;
  prefetchUris: ReadonlyArray<string>;
}

/**
 * Resolves Phase 2 modal props (placeholder thumbnail signed URL,
 * adjacent-image prefetch URLs) for a focused image.
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
  const [placeholderUri, setPlaceholderUri] = useState<string | null>(null);

  const thumbnailPath = file?.thumbnail_path ?? null;
  useEffect(() => {
    if (!thumbnailPath) {
      setPlaceholderUri(null);
      return;
    }
    let cancelled = false;
    void queryClient
      .fetchQuery({
        queryKey: ["project-file-signed-url", thumbnailPath],
        queryFn: () => getSignedUrl(backend, thumbnailPath),
        staleTime: SIGNED_URL_STALE_MS,
      })
      .then((url) => {
        if (!cancelled) setPlaceholderUri(url);
      })
      .catch(() => {
        if (!cancelled) setPlaceholderUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [thumbnailPath, queryClient]);

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
    cacheKey: file?.storage_path,
    intrinsicWidth: file?.width,
    intrinsicHeight: file?.height,
    placeholderUri,
    blurhash: file?.blurhash ?? null,
    prefetchUris,
  };
}
