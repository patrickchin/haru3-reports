import { ComponentProps } from "react";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import {
  getActionErrorDialogCopy,
  getDeleteNoteDialogCopy,
  getFinalizeReportDialogCopy,
} from "@/lib/app-dialog-copy";
import type { FileMetadataRow } from "@/lib/file-upload";
import type { FileCategory } from "@/lib/file-validation";

type ImagePreviewExtras = Omit<
  ComponentProps<typeof ImagePreviewModal>,
  "visible" | "title" | "onClose"
>;

interface GenerateReportDialogsProps {
  // Finalize
  isFinalizeConfirmVisible: boolean;
  isFinalizing: boolean;
  hasReport: boolean;
  onConfirmFinalize: () => void;
  onCancelFinalize: () => void;

  // Delete note
  noteDeleteIndex: number | null;
  onConfirmDeleteNote: () => void;
  onCancelDeleteNote: () => void;

  // Draft delete error
  draftDeleteErrorMessage: string | null;
  onDismissDraftDeleteError: () => void;

  // Upload error
  fileUploadErrorMessage: string | null;
  onDismissFileUploadError: () => void;

  // Image preview
  imagePreviewFile: FileMetadataRow | null;
  imagePreviewExtras: ImagePreviewExtras;
  onCloseImagePreview: () => void;

  // Attachment sheet
  isAttachmentSheetVisible: boolean;
  onCloseAttachmentSheet: () => void;
  onPickAttachment: (
    category: Exclude<FileCategory, "avatar" | "voice-note">,
  ) => void;
  onCameraCapture: () => void;
}

export function GenerateReportDialogs({
  isFinalizeConfirmVisible,
  isFinalizing,
  hasReport,
  onConfirmFinalize,
  onCancelFinalize,
  noteDeleteIndex,
  onConfirmDeleteNote,
  onCancelDeleteNote,
  draftDeleteErrorMessage,
  onDismissDraftDeleteError,
  fileUploadErrorMessage,
  onDismissFileUploadError,
  imagePreviewFile,
  imagePreviewExtras,
  onCloseImagePreview,
  isAttachmentSheetVisible,
  onCloseAttachmentSheet,
  onPickAttachment,
  onCameraCapture,
}: GenerateReportDialogsProps) {
  const finalizeConfirmCopy = getFinalizeReportDialogCopy();
  const deleteNoteCopy = getDeleteNoteDialogCopy();

  const draftDeleteErrorDialog = draftDeleteErrorMessage
    ? getActionErrorDialogCopy({
        title: "Delete Failed",
        fallbackMessage: "Could not delete the draft report.",
        message: draftDeleteErrorMessage,
      })
    : null;

  const fileUploadErrorDialog = fileUploadErrorMessage
    ? getActionErrorDialogCopy({
        title: "Upload Failed",
        fallbackMessage: "Could not attach the file to this report.",
        message: fileUploadErrorMessage,
      })
    : null;

  return (
    <>
      <AppDialogSheet
        visible={isFinalizeConfirmVisible}
        title={finalizeConfirmCopy.title}
        message={finalizeConfirmCopy.message}
        noticeTone={finalizeConfirmCopy.tone}
        noticeTitle={finalizeConfirmCopy.noticeTitle}
        canDismiss={!isFinalizing}
        onClose={() => {
          if (!isFinalizing) onCancelFinalize();
        }}
        actions={[
          {
            label: isFinalizing ? "Finalizing..." : finalizeConfirmCopy.confirmLabel,
            variant: finalizeConfirmCopy.confirmVariant,
            onPress: onConfirmFinalize,
            disabled: isFinalizing || !hasReport,
            accessibilityLabel: "Confirm finalize report",
          },
          {
            label: finalizeConfirmCopy.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: onCancelFinalize,
            disabled: isFinalizing,
            accessibilityLabel: "Cancel finalize report",
          },
        ]}
      />

      <AppDialogSheet
        visible={noteDeleteIndex !== null}
        title={deleteNoteCopy.title}
        message={deleteNoteCopy.message}
        noticeTone={deleteNoteCopy.tone}
        noticeTitle={deleteNoteCopy.noticeTitle}
        onClose={onCancelDeleteNote}
        actions={[
          {
            label: deleteNoteCopy.confirmLabel,
            variant: deleteNoteCopy.confirmVariant,
            onPress: onConfirmDeleteNote,
            accessibilityLabel: "Confirm delete note",
            align: "start",
          },
          {
            label: deleteNoteCopy.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: onCancelDeleteNote,
            accessibilityLabel: "Cancel deleting note",
          },
        ]}
      />

      <AppDialogSheet
        visible={draftDeleteErrorDialog !== null}
        title={draftDeleteErrorDialog?.title ?? "Delete Failed"}
        message={draftDeleteErrorDialog?.message ?? ""}
        noticeTone={draftDeleteErrorDialog?.tone ?? "danger"}
        noticeTitle={draftDeleteErrorDialog?.noticeTitle}
        onClose={onDismissDraftDeleteError}
        actions={
          draftDeleteErrorDialog
            ? [
                {
                  label: draftDeleteErrorDialog.confirmLabel,
                  variant: draftDeleteErrorDialog.confirmVariant,
                  onPress: onDismissDraftDeleteError,
                  accessibilityLabel: "Dismiss draft delete error",
                },
              ]
            : []
        }
      />

      <AppDialogSheet
        visible={fileUploadErrorDialog !== null}
        title={fileUploadErrorDialog?.title ?? "Upload Failed"}
        message={fileUploadErrorDialog?.message ?? ""}
        noticeTone={fileUploadErrorDialog?.tone ?? "danger"}
        noticeTitle={fileUploadErrorDialog?.noticeTitle}
        onClose={onDismissFileUploadError}
        actions={
          fileUploadErrorDialog
            ? [
                {
                  label: fileUploadErrorDialog.confirmLabel,
                  variant: fileUploadErrorDialog.confirmVariant,
                  onPress: onDismissFileUploadError,
                  accessibilityLabel: "Dismiss file upload error",
                  testID: "btn-dismiss-file-upload-error",
                },
              ]
            : []
        }
      />

      <ImagePreviewModal
        visible={imagePreviewFile !== null}
        title={imagePreviewFile?.filename}
        onClose={onCloseImagePreview}
        {...imagePreviewExtras}
      />

      <AppDialogSheet
        visible={isAttachmentSheetVisible}
        title="Add attachment"
        onClose={onCloseAttachmentSheet}
        actions={[
          {
            label: "Document",
            variant: "secondary",
            onPress: () => {
              onCloseAttachmentSheet();
              onPickAttachment("document");
            },
            accessibilityLabel: "Pick a document",
          },
          {
            label: "Photo Library",
            variant: "secondary",
            onPress: () => {
              onCloseAttachmentSheet();
              onPickAttachment("image");
            },
            accessibilityLabel: "Pick a photo from library",
          },
          {
            label: "Camera",
            variant: "secondary",
            onPress: () => {
              onCloseAttachmentSheet();
              onCameraCapture();
            },
            accessibilityLabel: "Take a photo with the camera",
          },
          {
            label: "Cancel",
            variant: "quiet",
            onPress: onCloseAttachmentSheet,
            accessibilityLabel: "Cancel attachment picker",
          },
        ]}
      />
    </>
  );
}
