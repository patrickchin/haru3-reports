import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { Card } from "@/components/ui/Card";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { getDeleteNoteDialogCopy } from "@/lib/app-dialog-copy";
import { colors } from "@/lib/design-tokens/colors";
import { formatCapturedAt } from "@/lib/format-date";
import type { NoteEntry } from "@/lib/note-entry";

interface TextNoteCardProps {
  entry: NoteEntry;
  /** Index in the underlying NoteEntry[] used for testIDs and removal. */
  sourceIndex: number;
  /** Display name resolved from `entry.authorId`. */
  authorName: string;
  /** Hide options for read-only views. */
  readOnly?: boolean;
  /** Removal handler — when omitted (or readOnly), Delete is not surfaced. */
  onRemove?: (sourceIndex: number) => void;
}

/**
 * One typed text note in the timeline. Header layout (author left,
 * timestamp right, both 10px muted) intentionally matches `VoiceNoteCard`
 * and the photo variant of `FileCard` so all three timeline rows align.
 *
 * Tapping the three-dot button opens an options sheet with the note's
 * metadata (text, author, id, captured-at) — each row is copy-on-tap —
 * plus actions to copy the note text or delete it. Delete opens the
 * standard confirmation dialog. Optimistic / pending entries hide the
 * three-dot button entirely (matches the previous trash-icon behaviour).
 */
export function TextNoteCard({
  entry,
  sourceIndex,
  authorName,
  readOnly,
  onRemove,
}: TextNoteCardProps) {
  const { copy } = useCopyToClipboard();
  const [isOptionsDialogVisible, setIsOptionsDialogVisible] = useState(false);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const deleteCopy = getDeleteNoteDialogCopy();

  const canManage = !entry.isPending && !readOnly && Boolean(onRemove);

  const handleCopyValue = (
    value: string | null | undefined,
    toast: string,
  ) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return;
    void copy(trimmed, { toast });
  };

  const handleOpenOptions = () => {
    setIsOptionsDialogVisible(true);
  };

  const handleCopyNote = () => {
    handleCopyValue(entry.text, "Note copied");
    setIsOptionsDialogVisible(false);
  };

  const handleDeleteFromOptions = () => {
    setIsOptionsDialogVisible(false);
    setIsDeleteConfirmVisible(true);
  };

  const handleConfirmDelete = () => {
    setIsDeleteConfirmVisible(false);
    onRemove?.(sourceIndex);
  };

  const capturedDisplay = formatCapturedAt(entry.addedAt) || "—";

  return (
    <>
      <Card className="gap-1.5 p-3">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className="flex-1 text-[10px] font-medium text-muted-foreground"
            numberOfLines={1}
            testID={`text-note-author-${sourceIndex}`}
          >
            {authorName}
          </Text>
          <Text
            className="text-[10px] text-muted-foreground"
            numberOfLines={1}
            testID={`text-note-captured-at-${sourceIndex}`}
          >
            {capturedDisplay}
          </Text>
        </View>
        <View className="flex-row items-start gap-2">
          <Text className="flex-1 text-body text-foreground">
            {entry.text}
          </Text>
          {canManage ? (
            <Pressable
              onPress={handleOpenOptions}
              hitSlop={8}
              accessibilityLabel="Note options"
              testID={`btn-text-note-options-${sourceIndex}`}
              className="h-7 w-7 items-center justify-center rounded-md"
            >
              <MoreVertical size={16} color={colors.muted.foreground} />
            </Pressable>
          ) : entry.isPending ? (
            <View
              className="h-7 w-7 items-center justify-center"
              testID={`text-note-pending-${sourceIndex}`}
            >
              <ActivityIndicator size="small" color={colors.muted.foreground} />
            </View>
          ) : null}
        </View>
      </Card>
      <AppDialogSheet
        visible={isOptionsDialogVisible}
        title="Note options"
        onClose={() => setIsOptionsDialogVisible(false)}
        actions={[
          {
            label: "Copy note",
            variant: "secondary",
            disabled: !entry.text.trim(),
            onPress: handleCopyNote,
            testID: `dialog-action-text-note-copy-${sourceIndex}`,
          },
          ...(canManage
            ? [
                {
                  label: "Delete",
                  variant: "destructive" as const,
                  onPress: handleDeleteFromOptions,
                  testID: `dialog-action-text-note-delete-${sourceIndex}`,
                },
              ]
            : []),
        ]}
      >
        <View
          className="gap-2 rounded-md bg-muted/40 p-3"
          testID={`text-note-options-meta-${sourceIndex}`}
        >
          <MetaRow
            label="Note"
            value={entry.text}
            onPress={() => handleCopyValue(entry.text, "Note copied")}
            accessibilityLabel="Copy note text"
            testID={`text-note-options-text-${sourceIndex}`}
          />
          <MetaRow
            label="Author"
            value={authorName}
            onPress={
              authorName
                ? () => handleCopyValue(authorName, "Author copied")
                : undefined
            }
            accessibilityLabel={authorName ? "Copy author" : undefined}
            testID={`text-note-options-author-${sourceIndex}`}
          />
          {entry.id ? (
            <MetaRow
              label="ID"
              value={entry.id}
              onPress={() => handleCopyValue(entry.id, "Note id copied")}
              accessibilityLabel="Copy id"
              testID={`text-note-options-id-${sourceIndex}`}
            />
          ) : null}
          <MetaRow label="Added" value={capturedDisplay} />
          <Text className="mt-1 text-[10px] italic text-muted-foreground">
            Tap a row to copy.
          </Text>
        </View>
      </AppDialogSheet>
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
            accessibilityLabel: "Confirm delete note",
            align: "start",
            testID: `dialog-action-text-note-confirm-delete-${sourceIndex}`,
          },
          {
            label: deleteCopy.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: () => setIsDeleteConfirmVisible(false),
            accessibilityLabel: "Cancel deleting note",
            testID: `dialog-action-text-note-cancel-delete-${sourceIndex}`,
          },
        ]}
      />
    </>
  );
}

function MetaRow({
  label,
  value,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const content = (
    <View className="flex-row gap-2">
      <Text className="w-20 text-xs font-medium text-muted-foreground">
        {label}
      </Text>
      <Text className="flex-1 text-xs text-foreground">{value}</Text>
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
