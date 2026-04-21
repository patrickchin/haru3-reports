// Renders a single report image thumbnail. Handles:
// - local file URIs (pending upload) via `file://` prefix
// - remote storage paths via a signed URL
// - pending / uploading / failed overlay

import { View, Pressable, Text, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { AlertTriangle, RefreshCw } from "lucide-react-native";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";
import { uploadQueue } from "@/lib/image-upload-queue";
import type { ReportImageView } from "@/hooks/useReportImages";

interface ImageThumbnailProps {
  image: ReportImageView;
  size?: number;
  onPress?: () => void;
}

export function ImageThumbnail({
  image,
  size = 96,
  onPress,
}: ImageThumbnailProps) {
  // Prefer thumbnailPath; fall back to storagePath if none.
  const src = image.thumbnailPath ?? image.storagePath;
  const { data: url, isLoading } = useSignedImageUrl(src);

  const pending = image.__pending;
  const status = image.status;

  return (
    <Pressable onPress={onPress} className="relative">
      <View
        className="overflow-hidden rounded-lg bg-surface-muted"
        style={{ width: size, height: size }}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: size, height: size }}
            contentFit="cover"
          />
        ) : isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" />
          </View>
        ) : null}
      </View>

      {pending && status !== "done" && (
        <View className="absolute inset-0 items-center justify-center rounded-lg bg-black/30">
          {status === "failed" ? (
            <Pressable
              onPress={() => void uploadQueue.retry(image.id)}
              className="flex-row items-center gap-1 rounded-md bg-destructive px-2 py-1"
            >
              <AlertTriangle size={12} color="white" />
              <Text className="text-xs font-semibold text-white">Retry</Text>
            </Pressable>
          ) : status === "uploading" ? (
            <View className="flex-row items-center gap-1 rounded-md bg-black/60 px-2 py-1">
              <RefreshCw size={12} color="white" />
              <Text className="text-xs font-semibold text-white">Uploading</Text>
            </View>
          ) : (
            <View className="rounded-md bg-black/60 px-2 py-1">
              <Text className="text-xs font-semibold text-white">Pending</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
