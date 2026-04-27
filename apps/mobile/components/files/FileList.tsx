import { View, Text } from "react-native";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { FileCard } from "./FileCard";
import { type FileCategory } from "@/lib/file-validation";
import { type FileMetadataRow } from "@/lib/file-upload";

interface FileListProps {
  projectId: string;
  category?: FileCategory;
  reportId?: string | null;
  emptyMessage?: string;
  onOpen?: (signedUrl: string, file: FileMetadataRow) => void;
  readOnly?: boolean;
}

/** Renders the project's files matching the filters. */
export function FileList({
  projectId,
  category,
  reportId,
  emptyMessage = "No files yet.",
  onOpen,
  readOnly,
}: FileListProps) {
  const { data, isLoading, error } = useProjectFiles({
    projectId,
    category,
    reportId,
  });

  if (isLoading) {
    return (
      <Text className="text-sm text-muted-foreground" testID="file-list-loading">
        Loading files…
      </Text>
    );
  }

  if (error) {
    return (
      <Text className="text-sm text-danger-foreground">
        Could not load files: {error.message}
      </Text>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground" testID="file-list-empty">
        {emptyMessage}
      </Text>
    );
  }

  return (
    <View className="gap-2" testID="file-list">
      {data.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onOpen={onOpen}
          readOnly={readOnly}
        />
      ))}
    </View>
  );
}
