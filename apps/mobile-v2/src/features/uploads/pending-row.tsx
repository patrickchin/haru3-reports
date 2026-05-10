/**
 * Pending upload row component.
 *
 * Renders a file thumbnail, progress bar, and retry/cancel actions
 * for in-flight uploads. Used by the notes timeline (R11).
 */
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { FileText, X, RefreshCw } from "lucide-react-native";
import { useUploadJob } from "./use-upload-job";
import { getUploadQueue } from "./queue";
import { testIds } from "@/infra/test-ids";
import type { UploadJob } from "./jobs";

export interface PendingRowProps {
  jobId: string;
}

export function PendingRow({ jobId }: PendingRowProps) {
  const job = useUploadJob(jobId);
  if (!job) return null;

  const queue = getUploadQueue();

  const onRetry = () => queue.retryUpload(jobId);
  const onCancel = () => queue.cancelUpload(jobId);

  const progressPct = Math.round((job.progress ?? 0) * 100);

  return (
    <View
      className="flex-row items-center border border-gray-200 rounded-lg p-3 bg-white"
      testID={testIds.uploads.pendingRow(jobId)}
    >
      {/* Thumbnail or icon */}
      <View className="w-12 h-12 bg-gray-100 rounded mr-3 items-center justify-center">
        {job.state === "uploading" || job.state === "preprocessing" ? (
          <ActivityIndicator size="small" testID={testIds.uploads.progress(jobId)} />
        ) : (
          <FileText size={24} color="#666" />
        )}
      </View>

      {/* Status */}
      <View className="flex-1">
        <Text className="text-sm font-medium text-gray-900">
          {job.input.filename}
        </Text>
        <Text className="text-xs text-gray-500">
          {stateLabel(job)} {job.state === "uploading" && `${progressPct}%`}
        </Text>
        {job.lastError && (
          <Text className="text-xs text-red-600 mt-1" numberOfLines={2}>
            {job.lastError}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View className="flex-row gap-2">
        {job.state === "failed" && (
          <Pressable
            onPress={onRetry}
            className="p-2"
            testID={testIds.uploads.retryButton(jobId)}
          >
            <RefreshCw size={20} color="#666" />
          </Pressable>
        )}
        {(job.state === "pending" ||
          job.state === "preprocessing" ||
          job.state === "uploading" ||
          job.state === "failed") && (
          <Pressable
            onPress={onCancel}
            className="p-2"
            testID={testIds.uploads.cancelButton(jobId)}
          >
            <X size={20} color="#666" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function stateLabel(job: UploadJob): string {
  switch (job.state) {
    case "pending":
      return "Waiting…";
    case "preprocessing":
      return "Processing…";
    case "uploading":
      return "Uploading…";
    case "uploaded":
      return "Uploaded";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "";
  }
}
