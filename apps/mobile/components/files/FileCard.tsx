import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Mic, Paperclip, Trash2 } from "lucide-react-native";
import { useDeleteFile } from "@/hooks/useProjectFiles";
import { backend } from "@/lib/backend";
import { getSignedUrl, type FileMetadataRow } from "@/lib/file-upload";
import { prefetchImages } from "@/lib/image-cache";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Card } from "@/components/ui/Card";
import { CachedImage } from "@/components/ui/CachedImage";
import { getDeleteFileDialogCopy } from "@/lib/app-dialog-copy";
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
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);

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

  // Eagerly prefetch the full-res signed URL *and* warm expo-image's
  // disk cache for the original bytes. This way tapping the card opens
  // the preview modal instantly: handleOpen's fetchQuery returns
  // synchronously from the TanStack cache and the JPEG is already on
  // disk, so the modal's <CachedImage> renders the full-res photo
  // without a network round-trip. Best-effort — failures are swallowed.
  useEffect(() => {
    if (file.category !== "image") return;
    let cancelled = false;
    void queryClient
      .fetchQuery({
        queryKey: ["project-file-signed-url", file.storage_path],
        queryFn: () => getSignedUrl(backend, file.storage_path),
        staleTime: 30 * 60 * 1000,
      })
      .then((url) => {
        if (cancelled) return;
        void prefetchImages([url]);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [file.category, file.storage_path, queryClient]);

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
    setIsDeleteConfirmVisible(true);
  };

  const handleConfirmDelete = () => {
    setIsDeleteConfirmVisible(false);
    deleteFile.mutate({
      fileId: file.id,
      storagePath: file.storage_path,
      projectId: file.project_id,
      thumbnailPath,
    });
  };

  const deleteCopy = getDeleteFileDialogCopy(file.filename);

  return (
    <>
    <Card className="flex-row items-center gap-3 p-3">
      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-secondary">
        {thumbUrl ? (
          <CachedImage
            source={{ uri: thumbUrl }}
            cacheKey={thumbnailPath ?? undefined}
            blurhash={file.blurhash ?? undefined}
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
    <AppDialogSheet
      visible={isDeleteConfirmVisible}
      title={deleteCopy.title}
      message={deleteCopy.message}
      noticeTone={deleteCopy.tone}
      noticeTitle={deleteCopy.noticeTitle}
      onClose={() => setIsDeleteConfirmVisible(false)}
      actions={[
        {
          label: deleteCopy.confirmLabel,
          variant: deleteCopy.confirmVariant,
          onPress: handleConfirmDelete,
          accessibilityLabel: `Confirm delete ${file.filename}`,
          align: "start",
        },
        {
          label: deleteCopy.cancelLabel ?? "Cancel",
          variant: "quiet",
          onPress: () => setIsDeleteConfirmVisible(false),
          accessibilityLabel: "Cancel deleting file",
        },
      ]}
    />
    </>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
