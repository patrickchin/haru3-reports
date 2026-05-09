import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { ImagePreviewModal } from "@/components/files/ImagePreviewModal";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import {
  getActionErrorDialogCopy,
  getDeleteNoteDialogCopy,
  getFinalizeReportDialogCopy,
} from "@/lib/app-dialog-copy";

/**
 * All modal/dialog UI for the Generate screen. Reads visibility state +
 * dismiss handlers straight from `useGenerateReport()` — no props needed.
 */
export function GenerateReportDialogs() {
  const {
    generation,
    draft,
    notes,
    preview,
    ui,
    handlePickAttachment,
    photo,
  } = useGenerateReport();
  const hasReport = generation.report !== null;
  const finalizeConfirmCopy = getFinalizeReportDialogCopy();
  const deleteNoteCopy = getDeleteNoteDialogCopy();

  const draftDeleteErrorDialog = draft.draftDeleteErrorMessage
    ? getActionErrorDialogCopy({
        title: "Delete Failed",
        fallbackMessage: "Could not delete the draft report.",
        message: draft.draftDeleteErrorMessage,
      })
    : null;

  const fileUploadErrorDialog = ui.fileUploadError
    ? getActionErrorDialogCopy({
        title: "Upload Failed",
        fallbackMessage: "Could not attach the file to this report.",
        message: ui.fileUploadError,
      })
    : null;

  const closeAttachmentSheet = () => ui.setAttachmentSheetVisible(false);
  const cancelFinalize = () => draft.setIsFinalizeConfirmVisible(false);

  return (
    <>
      <AppDialogSheet
        visible={draft.isFinalizeConfirmVisible}
        title={finalizeConfirmCopy.title}
        message={finalizeConfirmCopy.message}
        noticeTone={finalizeConfirmCopy.tone}
        noticeTitle={finalizeConfirmCopy.noticeTitle}
        canDismiss={!draft.isFinalizing}
        onClose={() => {
          if (!draft.isFinalizing) cancelFinalize();
        }}
        actions={[
          {
            label: draft.isFinalizing ? "Finalizing..." : finalizeConfirmCopy.confirmLabel,
            variant: finalizeConfirmCopy.confirmVariant,
            onPress: () => draft.finalizeReport(),
            disabled: draft.isFinalizing || !hasReport,
            accessibilityLabel: "Confirm finalize report",
          },
          {
            label: finalizeConfirmCopy.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: cancelFinalize,
            disabled: draft.isFinalizing,
            accessibilityLabel: "Cancel finalize report",
          },
        ]}
      />

      <AppDialogSheet
        visible={notes.deleteIndex !== null}
        title={deleteNoteCopy.title}
        message={deleteNoteCopy.message}
        noticeTone={deleteNoteCopy.tone}
        noticeTitle={deleteNoteCopy.noticeTitle}
        onClose={() => notes.setDeleteIndex(null)}
        actions={[
          {
            label: deleteNoteCopy.confirmLabel,
            variant: deleteNoteCopy.confirmVariant,
            onPress: notes.confirmDelete,
            accessibilityLabel: "Confirm delete note",
            align: "start",
          },
          {
            label: deleteNoteCopy.cancelLabel ?? "Cancel",
            variant: "quiet",
            onPress: () => notes.setDeleteIndex(null),
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
        onClose={() => draft.setDraftDeleteErrorMessage(null)}
        actions={
          draftDeleteErrorDialog
            ? [
                {
                  label: draftDeleteErrorDialog.confirmLabel,
                  variant: draftDeleteErrorDialog.confirmVariant,
                  onPress: () => draft.setDraftDeleteErrorMessage(null),
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
        onClose={() => ui.setFileUploadError(null)}
        actions={
          fileUploadErrorDialog
            ? [
                {
                  label: fileUploadErrorDialog.confirmLabel,
                  variant: fileUploadErrorDialog.confirmVariant,
                  onPress: () => ui.setFileUploadError(null),
                  accessibilityLabel: "Dismiss file upload error",
                  testID: "btn-dismiss-file-upload-error",
                },
              ]
            : []
        }
      />

      <ImagePreviewModal
        visible={preview.file !== null}
        title={preview.file?.filename}
        onClose={() => preview.set(null)}
        {...preview.extras}
      />

      <AppDialogSheet
        visible={ui.attachmentSheetVisible}
        title="Add attachment"
        onClose={closeAttachmentSheet}
        actions={[
          {
            label: "Document",
            variant: "secondary",
            onPress: () => {
              closeAttachmentSheet();
              handlePickAttachment("document");
            },
            accessibilityLabel: "Pick a document",
          },
          {
            label: "Photo Library",
            variant: "secondary",
            onPress: () => {
              closeAttachmentSheet();
              handlePickAttachment("image");
            },
            accessibilityLabel: "Pick a photo from library",
          },
          {
            label: "Camera",
            variant: "secondary",
            onPress: () => {
              closeAttachmentSheet();
              void photo.handleCameraCapture();
            },
            accessibilityLabel: "Take a photo with the camera",
          },
          {
            label: "Cancel",
            variant: "quiet",
            onPress: closeAttachmentSheet,
            accessibilityLabel: "Cancel attachment picker",
          },
        ]}
      />
    </>
  );
}
