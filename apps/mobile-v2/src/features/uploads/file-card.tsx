/**
 * File card component for displaying uploaded files (images, documents).
 *
 * Renders a clickable card with thumbnail (for images) or icon (for docs).
 * Opens image preview lightbox for images, external file viewer for documents.
 */
import { View, Text, Pressable, Image } from "react-native";
import { FileText } from "lucide-react-native";
import { testIds } from "@/infra/test-ids";
import { useSignedUrl } from "./use-signed-url";

export interface FileCardProps {
  fileId: string;
  filename: string;
  mimeType: string;
  storagePath?: string;
  sizeBytes?: number;
  onPress: () => void;
}

export function FileCard({
  fileId,
  filename,
  mimeType,
  storagePath,
  sizeBytes,
  onPress,
}: FileCardProps) {
  const isImage = mimeType.startsWith("image/");
  const { data: signedUrl } = useSignedUrl(storagePath);

  const sizeLabel = sizeBytes
    ? sizeBytes < 1024 * 1024
      ? `${(sizeBytes / 1024).toFixed(1)} KB`
      : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : null;

  return (
    <Pressable
      onPress={onPress}
      className="rounded-lg border border-gray-200 bg-white overflow-hidden"
      testID={testIds.reports.openFileButton(fileId)}
    >
      {isImage && signedUrl ? (
        <Image
          source={{ uri: signedUrl }}
          className="w-full h-48"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-48 items-center justify-center bg-gray-100">
          <FileText size={48} color="#666" />
        </View>
      )}
      <View className="p-3">
        <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
          {filename}
        </Text>
        <View className="flex-row gap-2 mt-1">
          <Text className="text-xs text-gray-500">{mimeType}</Text>
          {sizeLabel && (
            <Text className="text-xs text-gray-500">• {sizeLabel}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
