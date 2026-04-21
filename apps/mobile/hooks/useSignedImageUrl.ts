// Hook for signed-URL access to stored report images.
// Caches URLs in memory for the session; re-signs when close to expiry.

import { useQuery } from "@tanstack/react-query";
import { getImageStorageProvider } from "@/lib/image-storage-provider";

// Signed URLs last 1 hour; we refresh every 50 min via the query gcTime.
const EXPIRY_SECONDS = 60 * 60;
const STALE_MS = 50 * 60 * 1000;

/**
 * Returns a signed URL for a stored image path. For local (pending) paths
 * (those starting with file://) returns the path unchanged.
 */
export function useSignedImageUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-image-url", path],
    enabled: Boolean(path),
    staleTime: STALE_MS,
    gcTime: STALE_MS,
    queryFn: async (): Promise<string> => {
      if (!path) return "";
      if (path.startsWith("file://") || path.startsWith("/")) return path;
      return getImageStorageProvider().getSignedUrl(path, EXPIRY_SECONDS);
    },
  });
}
