/**
 * Shared hook for fetching signed URLs from Supabase Storage.
 *
 * Extracted from voice-note-card.tsx for reuse across image/document
 * previews in the timeline.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/infra/supabase";

const PROJECT_FILES_BUCKET = "project-files";

export function useSignedUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: ["signedUrl", storagePath],
    enabled: !!storagePath,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(PROJECT_FILES_BUCKET)
        .createSignedUrl(storagePath!, 60 * 60);
      if (error || !data) {
        throw new Error(`Signed URL failed: ${error?.message ?? "unknown"}`);
      }
      return data.signedUrl;
    },
  });
}
