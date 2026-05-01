import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Mic, Paperclip, Trash2 } from "lucide-react-native";
import { useDeleteFile } from "@/hooks/useProjectFiles";
import { backend } from "@/lib/backend";
import { getSignedUrl, type FileMetadataRow } from "@/lib/file-upload";
import { Card } from "@/components/ui/Card";
import { CachedImage } from "@/components/ui/CachedImage";
import { colors } from "@/lib/design-tokens/colors";

const CATEGORY_ICON: Record<string, typeof FileText> = {
  document: FileText,
  image: ImageIcon,
  "voice-note": Mic,
  attachment: Paperclip,
  icon: ImageIcon,
};

interface FileCardProps {
  file: FileMetadataRow;
  /** Called when the user taps the body of the card. Receives a signed URL. */
  onOpen?: (signedUrl: string, file: FileMetadataRow) => void;
  /** Hide the delete button for read-only views. */
  readOnly?: boolean;
}

/**
 * One file in a project — title, size, icon. Tapping the body fetches a
 * signed URL and forwards to `onOpen` (e.g. to launch the PDF viewer).
 */
export function FileCard({ file, onOpen, readOnly }: FileCardProps) {
  const Icon = CATEGORY_ICON[file.category] ?? FileText;
  const queryClient = useQueryClient();
  const deleteFile = useDeleteFile();
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Resolve a signed URL for the inline thumbnail. Reuses the same
  // TanStack cache key (and 30-min staleTime) as the open-file flow so we
  // don't double-fetch when the user taps the card right after the list
  // renders.
  const thumbnailPath = file.thumbnail_path ?? null;
  useEffect(() => {
    if (file.category !== "image" || !thumbnailPath) {
      setThumbUrl(null);
      return;
    }
    let cancelled = false;
    void queryClient
      .fetchQuery({
        queryKey: ["project-file-signed-url", thumbnailPath],
        queryFn: () => getSignedUrl(backend, thumbnailPath),
        staleTime: 30 * 60 * 1000,
      })
      .then((url) => {
        if (!cancelled) setThumbUrl(url);
      })
      .catch(() => {
        if (!cancelled) setThumbUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [file.category, thumbnailPath, queryClient]);

  const handleOpen = async () => {
    if (!onOpen) return;
    setIsOpening(true);
    setOpenError(null);
    try {
      const url = await queryClient.fetchQuery({
        queryKey: ["project-file-signed-url", file.storage_path],
        queryFn: () => getSignedUrl(backend, file.storage_path),
        staleTime: 30 * 60 * 1000,
      });
      onOpen(url, file);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not open file");
    } finally {
      setIsOpening(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete file",
      `Are you sure you want to delete "${file.filename}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteFile.mutate({
              fileId: file.id,
              storagePath: file.storage_path,
              projectId: file.project_id,
              thumbnailPath,
            });
          },
        },
      ],
    );
  };

  return (
    <Card className="flex-row items-center gap-3 p-3">
      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-secondary">
        {thumbUrl ? (
          <CachedImage
            source={{ uri: thumbUrl }}
            cacheKey={thumbnailPath ?? undefined}
            intrinsicWidth={file.width}
            intrinsicHeight={file.height}
            style={{ width: 40, height: 40 }}
            accessibilityLabel={file.filename}
          />
        ) : (
          <Icon size={18} color={colors.foreground} />
        )}
      </View>
      <Pressable
        className="flex-1"
        onPress={handleOpen}
        disabled={!onOpen || isOpening}
        accessibilityLabel={`Open ${file.filename}`}
      >
        <Text numberOfLines={1} className="text-sm font-semibold text-foreground" selectable>
          {file.filename}
        </Text>
        <Text className="text-xs text-muted-foreground" selectable>
          {humanSize(file.size_bytes)}
          {file.duration_ms != null
            ? ` · ${Math.round(file.duration_ms / 1000)}s`
            : ""}
        </Text>
        {openError ? (
          <Text className="text-xs text-danger-foreground" selectable>{openError}</Text>
        ) : null}
      </Pressable>
      {!readOnly ? (
        <Pressable
          onPress={handleDelete}
          hitSlop={8}
          disabled={deleteFile.isPending}
          accessibilityLabel={`Delete ${file.filename}`}
          testID={`btn-delete-file-${file.id}`}
          className="h-8 w-8 items-center justify-center rounded-md"
        >
          {deleteFile.isPending ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <Trash2 size={16} color={colors.danger.DEFAULT} />
          )}
        </Pressable>
      ) : null}
    </Card>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
