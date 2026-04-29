import { useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Plus } from "lucide-react-native";
import { useFileUpload } from "@/hooks/useProjectFiles";
import { type FileCategory } from "@/lib/file-validation";
import { pickProjectFile } from "@/lib/pick-project-file";
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
    const result = await pickProjectFile(category);
    if (result.kind === "error") {
      setPickError(result.message);
      return;
    }
    if (result.kind === "canceled") return;
    upload.mutate({ projectId, category, ...result.file });
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
