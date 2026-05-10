/**
 * File card component for displaying uploaded files (images, documents).
 *
 * Renders a clickable card with thumbnail (for images) or icon (for docs).
 * Opens image preview lightbox for images, external file viewer for documents.
 */
import { View, Text, Pressable, Image } from "react-native";
import { FileText } from "lucide-react-native";
import { testIds } from "@/infra/test-ids";

export interface FileCardProps {
  fileId: string;
  filename: string;
  mimeType: string;
  thumbnailUrl?: string;
  onPress: () => void;
}

export function FileCard({
  fileId,
  filename,
  mimeType,
  thumbnailUrl,
  onPress,
}: FileCardProps) {
  const isImage = mimeType.startsWith("image/");

  return (
    <Pressable
      onPress={onPress}
      className="rounded-lg border border-gray-200 bg-white overflow-hidden"
      testID={testIds.reports.openFileButton(fileId)}
    >
      {isImage && thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
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
        <Text className="text-xs text-gray-500 mt-1">{mimeType}</Text>
      </View>
    </Pressable>
  );
}
