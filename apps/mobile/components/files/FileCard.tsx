import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Mic, MoreVertical, Paperclip, Trash2 } from "lucide-react-native";
import { useDeleteFile, useFileSignedUrl } from "@/hooks/useProjectFiles";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import type { FileMetadataRow } from "@/lib/file-upload";
import { prefetchImages } from "@/lib/image-cache";
import { shareImage } from "@/lib/image-share";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Card } from "@/components/ui/Card";
import { CachedImage } from "@/components/ui/CachedImage";
import { getDeleteFileDialogCopy } from "@/lib/app-dialog-copy";
import { colors } from "@/lib/design-tokens/colors";
import { formatCapturedAt } from "@/lib/format-date";

const CATEGORY_ICON: Record<string, typeof FileText> = {
  document: FileText,
  image: ImageIcon,
  "voice-note": Mic,
  attachment: Paperclip,
  icon: ImageIcon,
};

interface FileCardProps {
  file: FileMetadataRow;
  /**
   * Called synchronously when the user taps the card body. The handler
   * is responsible for opening any preview UI immediately and resolving
   * a signed URL itself (typically via `useImagePreviewProps`). Firing
   * synchronously means the preview modal opens on the next frame
   * regardless of network latency.
   */
  onOpen?: (file: FileMetadataRow) => void;
  /** Display name of the user who attached this file to the report.
   *  Surfaced top-left on photo cards (matches voice-note style). */
  authorName?: string | null;
  /** ISO timestamp shown beneath the author / size line. Should be the
   *  linked `report_notes.created_at` (i.e. when the user attached the
   *  file to the report) — falls back to `file.created_at` when null. */
  capturedAt?: string | null;
  /** Hide the delete button for read-only views. */
  readOnly?: boolean;
}

/**
 * One file in a project — title, size, icon. Tapping the body invokes
 * `onOpen(file)` synchronously; the parent owns the URL fetch + viewer.
 */
export function FileCard({
  file,
  onOpen,
  authorName,
  capturedAt,
  readOnly,
}: FileCardProps) {
  const Icon = CATEGORY_ICON[file.category] ?? FileText;
  const deleteFile = useDeleteFile();
  const { copy } = useCopyToClipboard();
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [isOptionsDialogVisible, setIsOptionsDialogVisible] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isShareBusy, setIsShareBusy] = useState(false);
  const thumbnailPath = file.thumbnail_path ?? null;
  const { data: thumbUrl } = useFileSignedUrl(
    file.category === "image" ? thumbnailPath : null,
  );
  const { data: fullResUrl } = useFileSignedUrl(
    file.category === "image" && onOpen ? file.storage_path : null,
  );

  // Eagerly prefetch the full-res signed URL *and* warm expo-image's
  // disk cache for the original bytes so the preview modal renders the
  // photo as soon as it opens. Only meaningful when an `onOpen` handler
  // is wired up; gating avoids pointless network traffic in read-only
  // contexts that don't open a viewer.
  useEffect(() => {
    if (!fullResUrl) return;
    void prefetchImages([fullResUrl]);
  }, [fullResUrl]);

  const handleOpen = () => {
    if (!onOpen) return;
    // Synchronous: do not await any network work. The parent must show
    // a loading state if its viewer needs a signed URL it doesn't yet
    // have. This is what makes tapping an image feel instant.
    onOpen(file);
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

  const closeOptionsDialog = () => {
    setIsOptionsDialogVisible(false);
    setShareError(null);
  };

  const handleOpenOptions = () => {
    setShareError(null);
    setIsOptionsDialogVisible(true);
  };

  const handleShareIntent = async (intent: "share" | "download") => {
    if (isShareBusy) return;
    setShareError(null);
    setIsShareBusy(true);
    try {
      await shareImage({
        fileId: file.id,
        signedUrl: fullResUrl ?? null,
        mimeType: file.mime_type,
        filename: file.filename,
        intent,
      });
      setIsOptionsDialogVisible(false);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Could not share the photo.",
      );
    } finally {
      setIsShareBusy(false);
    }
  };

  const handleCopyValue = (
    value: string | null | undefined,
    toast: string,
  ) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return;
    void copy(trimmed, { toast });
  };

  const handleDeleteFromOptions = () => {
    setIsOptionsDialogVisible(false);
    setIsDeleteConfirmVisible(true);
  };

  const deleteCopy = getDeleteFileDialogCopy(file.filename);

  // Image cards get a richer layout: large pressable thumbnail + body
  // (whole card opens the viewer), author/timestamp on the top-left,
  // and NO filename (UUID-style names aren't useful to users). The
  // delete button stays as its own non-overlapping pressable.
  const isImage = file.category === "image";
  const capturedDisplay = formatCapturedAt(capturedAt ?? file.created_at);

  if (isImage) {
    return (
      <>
        <Card className="flex-row items-start gap-3 p-3">
          <Pressable
            onPress={handleOpen}
            disabled={!onOpen}
            accessibilityLabel="Open photo"
            testID={`btn-open-file-${file.id}`}
            className="flex-1 flex-row items-start gap-3"
          >
            <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-secondary">
              {thumbUrl ? (
                <CachedImage
                  source={{ uri: thumbUrl }}
                  cacheKey={thumbnailPath ?? undefined}
                  blurhash={file.blurhash ?? undefined}
                  intrinsicWidth={file.width}
                  intrinsicHeight={file.height}
                  style={{ width: 64, height: 64 }}
                  accessibilityLabel="Photo thumbnail"
                />
              ) : (
                <Icon size={20} color={colors.foreground} />
              )}
            </View>
            <View className="flex-1">
              {authorName ? (
                <Text
                  className="text-sm font-semibold text-foreground"
                  numberOfLines={1}
                  testID={`file-author-${file.id}`}
                >
                  {authorName}
                </Text>
              ) : null}
              <Text
                className="text-xs text-muted-foreground"
                testID={`file-captured-at-${file.id}`}
              >
                {capturedDisplay}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {humanSize(file.size_bytes)}
              </Text>
            </View>
          </Pressable>
          {!readOnly ? (
            <Pressable
              onPress={handleOpenOptions}
              hitSlop={8}
              disabled={deleteFile.isPending}
              accessibilityLabel="Photo options"
              testID={`btn-file-options-${file.id}`}
              className="h-8 w-8 items-center justify-center rounded-md"
            >
              {deleteFile.isPending ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <MoreVertical size={18} color={colors.muted.foreground} />
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
              accessibilityLabel: "Confirm delete photo",
              align: "start",
            },
            {
              label: deleteCopy.cancelLabel ?? "Cancel",
              variant: "quiet",
              onPress: () => setIsDeleteConfirmVisible(false),
              accessibilityLabel: "Cancel deleting photo",
            },
          ]}
        />
        <AppDialogSheet
          visible={isOptionsDialogVisible}
          title="Photo options"
          onClose={closeOptionsDialog}
          actions={[
            {
              label: isShareBusy ? "Preparing…" : "Download",
              variant: "secondary",
              disabled: isShareBusy || !fullResUrl,
              onPress: () => {
                void handleShareIntent("download");
              },
              testID: `dialog-action-file-download-${file.id}`,
            },
            {
              label: isShareBusy ? "Preparing…" : "Share",
              variant: "secondary",
              disabled: isShareBusy || !fullResUrl,
              onPress: () => {
                void handleShareIntent("share");
              },
              testID: `dialog-action-file-share-${file.id}`,
            },
            {
              label: "Delete",
              variant: "destructive",
              disabled: deleteFile.isPending,
              onPress: handleDeleteFromOptions,
              testID: `dialog-action-file-delete-${file.id}`,
            },
          ]}
        >
          <View
            className="gap-2 rounded-md bg-muted/40 p-3"
            testID={`file-options-meta-${file.id}`}
          >
            <MetaRow
              label="Author"
              value={authorName ?? "Unknown author"}
              onPress={
                authorName
                  ? () => handleCopyValue(authorName, "Author copied")
                  : undefined
              }
              accessibilityLabel={authorName ? "Copy author" : undefined}
              testID={`file-options-author-${file.id}`}
            />
            <MetaRow
              label="ID"
              value={file.id}
              onPress={() => handleCopyValue(file.id, "Photo id copied")}
              accessibilityLabel="Copy id"
              testID={`file-options-id-${file.id}`}
            />
            {file.filename ? (
              <MetaRow
                label="Filename"
                value={file.filename}
                onPress={() => handleCopyValue(file.filename, "Filename copied")}
                accessibilityLabel="Copy filename"
                testID={`file-options-filename-${file.id}`}
              />
            ) : null}
            <MetaRow
              label="Captured"
              value={capturedDisplay || "—"}
            />
            {file.mime_type ? (
              <MetaRow label="Format" value={file.mime_type} />
            ) : null}
            {typeof file.size_bytes === "number" && file.size_bytes > 0 ? (
              <MetaRow label="Size" value={humanSize(file.size_bytes)} />
            ) : null}
            {file.width && file.height ? (
              <MetaRow
                label="Dimensions"
                value={`${file.width} × ${file.height}`}
              />
            ) : null}
            <Text className="mt-1 text-[10px] italic text-muted-foreground">
              Tap a row to copy.
            </Text>
          </View>
          {shareError ? (
            <Text
              className="mt-2 text-xs text-danger-foreground"
              selectable
              testID={`file-options-error-${file.id}`}
            >
              {shareError}
            </Text>
          ) : null}
        </AppDialogSheet>
      </>
    );
  }

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
        disabled={!onOpen}
        accessibilityLabel={`Open ${file.filename}`}
      >
        <Text numberOfLines={1} className="text-sm font-semibold text-foreground" selectable>
          {file.filename}
        </Text>
        <Text
          className="text-xs text-muted-foreground"
          testID={`file-captured-at-${file.id}`}
        >
          {formatCapturedAt(capturedAt ?? file.created_at)}
        </Text>
        <Text className="text-xs text-muted-foreground" selectable>
          {humanSize(file.size_bytes)}
          {file.duration_ms != null
            ? ` · ${Math.round(file.duration_ms / 1000)}s`
            : ""}
        </Text>
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

function MetaRow({
  label,
  value,
  selectable,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  value: string;
  selectable?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const content = (
    <View className="flex-row gap-2">
      <Text className="w-24 text-xs font-medium text-muted-foreground">
        {label}
      </Text>
      <Text className="flex-1 text-xs text-foreground" selectable={selectable}>
        {value}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
