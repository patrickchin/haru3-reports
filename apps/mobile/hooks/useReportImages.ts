// Merges server-side `report_images` rows with pending local upload-queue
// items into a single ordered list, keyed by report.

import { useEffect, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import {
  queuedImageAsReportImage,
  uploadQueue,
  type QueuedImage,
} from "@/lib/image-upload-queue";
import {
  reportImageFromRow,
  type ReportImage,
} from "@/lib/report-image-types";

export type ReportImageView = ReportImage & {
  __pending?: true;
  status?: QueuedImage["status"];
};

export function useReportImages(reportId: string | undefined) {
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState<QueuedImage[]>([]);

  // Subscribe to the local queue.
  useEffect(() => {
    let mounted = true;
    void uploadQueue.load();
    const unsub = uploadQueue.subscribe((items) => {
      if (!mounted) return;
      setQueued(items);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Drain triggers.
  useEffect(() => {
    const sub1 = AppState.addEventListener("change", (state) => {
      if (state === "active") void uploadQueue.drain();
    });
    const sub2 = NetInfo.addEventListener((info) => {
      if (info.isConnected) void uploadQueue.drain();
    });
    void uploadQueue.drain();
    return () => {
      sub1.remove();
      sub2();
    };
  }, []);

  const serverQuery = useQuery({
    queryKey: ["report-images", reportId],
    enabled: Boolean(reportId),
    queryFn: async (): Promise<ReportImage[]> => {
      if (!reportId) return [];
      const { data, error } = await backend
        .from("report_images")
        .select("*")
        .eq("report_id", reportId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(reportImageFromRow);
    },
  });

  // Invalidate server query when queue items finish.
  useEffect(() => {
    if (!reportId) return;
    const doneIds = queued.filter((q) => q.status === "done" && q.reportId === reportId);
    if (doneIds.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["report-images", reportId] });
    }
  }, [queued, reportId, queryClient]);

  const serverImages = serverQuery.data ?? [];
  const serverIds = new Set(serverImages.map((i) => i.id));

  // Pending (not-yet-inserted) items from the queue for this report.
  const pending: ReportImageView[] = queued
    .filter(
      (q) =>
        q.reportId === reportId &&
        q.status !== "done" &&
        !serverIds.has(q.id),
    )
    .map(queuedImageAsReportImage);

  // Merged view, pending first (most recent capture visible immediately).
  const images: ReportImageView[] = [...serverImages, ...pending].sort(
    (a, b) =>
      a.sortOrder !== b.sortOrder
        ? a.sortOrder - b.sortOrder
        : a.createdAt.localeCompare(b.createdAt),
  );

  return {
    images,
    isLoading: serverQuery.isLoading,
    error: serverQuery.error,
    refetch: serverQuery.refetch,
  };
}
