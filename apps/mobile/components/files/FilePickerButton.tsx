import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Plus } from "lucide-react-native";
import { useFileUpload } from "@/hooks/useProjectFiles";
import { type FileCategory } from "@/lib/file-validation";
import { Button } from "@/components/ui/Button";

interface FilePickerButtonProps {
  projectId: string;
  /** What kind of files to pick. */
  category: Exclude<FileCategory, "avatar" | "voice-note">;
  label?: string;
}

/**
 * Single button that picks a file (document or image) and uploads it to
 * the project-files bucket via the standard `useFileUpload` mutation.
 */
export function FilePickerButton({
  projectId,
  category,
  label,
}: FilePickerButtonProps) {
  const upload = useFileUpload();
  const [pickError, setPickError] = useState<string | null>(null);

  const onPress = async () => {
    setPickError(null);
    try {
      if (category === "image" || category === "icon") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setPickError("Photo library permission denied");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        upload.mutate({
          projectId,
          category,
          fileUri: asset.uri,
          filename: asset.fileName ?? `image-${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? "image/jpeg",
          sizeBytes: asset.fileSize ?? 0,
        });
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        upload.mutate({
          projectId,
          category,
          fileUri: asset.uri,
          filename: asset.name,
          mimeType: asset.mimeType ?? "application/octet-stream",
          sizeBytes: asset.size ?? 0,
        });
      }
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Could not pick file");
    }
  };

  const error = pickError ?? upload.error?.message;

  return (
    <View className="gap-2">
      <Button
        variant="secondary"
        onPress={onPress}
        disabled={upload.isPending}
        accessibilityLabel={label ?? `Add ${category}`}
      >
        <View className="flex-row items-center gap-2">
          {upload.isPending ? (
            <ActivityIndicator size="small" color="#1a1a2e" />
          ) : (
            <Plus size={16} color="#1a1a2e" />
          )}
          <Text className="text-sm font-semibold text-foreground">
            {upload.isPending ? "Uploading…" : label ?? `Add ${category}`}
          </Text>
        </View>
      </Button>
      {error ? (
        <Text className="text-xs text-danger-foreground">{error}</Text>
      ) : null}
    </View>
  );
}
