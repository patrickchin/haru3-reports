import { describe, expect, it } from "vitest";
import {
  getActionErrorDialogCopy,
  getDeleteDraftDialogCopy,
  getDeleteFileDialogCopy,
  getDeleteNoteDialogCopy,
  getDeleteProjectDialogCopy,
  getDeleteReportDialogCopy,
  getDeleteVoiceNoteDialogCopy,
  getFinalizeReportDialogCopy,
  getRemoveMemberDialogCopy,
  getUnfinalizeReportDialogCopy,
} from "./app-dialog-copy";

describe("getDeleteDraftDialogCopy", () => {
  it("returns destructive confirmation copy for draft deletion", () => {
    expect(getDeleteDraftDialogCopy()).toEqual({
      title: "Delete Draft",
      message: "This draft report will be removed. This cannot be undone.",
      tone: "danger",
      noticeTitle: "Permanent action",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmVariant: "destructive",
    });
  });
});

describe("getDeleteProjectDialogCopy", () => {
  it("returns destructive confirmation copy for project deletion", () => {
    expect(getDeleteProjectDialogCopy()).toEqual({
      title: "Delete Project",
      message: "This project and all its reports will be permanently deleted. This cannot be undone.",
      tone: "danger",
      noticeTitle: "Permanent action",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmVariant: "destructive",
    });
  });
});

describe("getDeleteReportDialogCopy", () => {
  it("returns destructive confirmation copy for report deletion", () => {
    expect(getDeleteReportDialogCopy()).toEqual({
      title: "Delete Report",
      message: "This report will be permanently deleted. This cannot be undone.",
      tone: "danger",
      noticeTitle: "Permanent action",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmVariant: "destructive",
    });
  });
});

describe("getActionErrorDialogCopy", () => {
  it("uses the provided message when present", () => {
    expect(
      getActionErrorDialogCopy({
        title: "Delete Failed",
        fallbackMessage: "Could not delete the draft report.",
        message: "Row-level security denied the request.",
      }),
    ).toEqual({
      title: "Delete Failed",
      message: "Row-level security denied the request.",
      tone: "danger",
      noticeTitle: "Action failed",
      confirmLabel: "Done",
      confirmVariant: "secondary",
    });
  });

  it("falls back to the default error message when none is provided", () => {
    expect(
      getActionErrorDialogCopy({
        title: "Export Failed",
        fallbackMessage: "Could not generate PDF.",
      }),
    ).toEqual({
      title: "Export Failed",
      message: "Could not generate PDF.",
      tone: "danger",
      noticeTitle: "Action failed",
      confirmLabel: "Done",
      confirmVariant: "secondary",
    });
  });
});

describe("getFinalizeReportDialogCopy", () => {
  it("returns non-destructive confirmation copy for finalizing a report", () => {
    expect(getFinalizeReportDialogCopy()).toEqual({
      title: "Finalize Report",
      message:
        "Once finalized, this report will be marked as final and locked from further AI regeneration. You can still export and share it.",
      tone: "warning",
      noticeTitle: "Confirm finalization",
      confirmLabel: "Finalize Report",
      cancelLabel: "Cancel",
      confirmVariant: "default",
    });
  });
});

describe("getUnfinalizeReportDialogCopy", () => {
  it("returns non-destructive confirmation copy for moving a report back to draft", () => {
    expect(getUnfinalizeReportDialogCopy()).toEqual({
      title: "Unfinalize Report",
      message:
        "Move this report back to a draft so you can edit and regenerate it. The current contents are preserved — you can finalize again at any time.",
      tone: "warning",
      noticeTitle: "Move back to draft",
      confirmLabel: "Unfinalize",
      cancelLabel: "Cancel",
      confirmVariant: "default",
    });
  });
});

describe("getRemoveMemberDialogCopy", () => {
  it("interpolates the member name into the message", () => {
    const copy = getRemoveMemberDialogCopy("Alex Park");
    expect(copy.title).toBe("Remove Member");
    expect(copy.message).toBe(
      "Alex Park will be removed from this project and will lose access to its reports.",
    );
    expect(copy.confirmLabel).toBe("Remove");
    expect(copy.confirmVariant).toBe("destructive");
    expect(copy.tone).toBe("danger");
  });
});

describe("getDeleteVoiceNoteDialogCopy", () => {
  it("returns destructive copy for voice-note deletion", () => {
    expect(getDeleteVoiceNoteDialogCopy()).toEqual({
      title: "Delete Voice Note",
      message: "Are you sure you want to delete this voice note? This cannot be undone.",
      tone: "danger",
      noticeTitle: "Permanent action",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmVariant: "destructive",
    });
  });
});

describe("getDeleteNoteDialogCopy", () => {
  it("returns destructive copy for note deletion", () => {
    expect(getDeleteNoteDialogCopy()).toEqual({
      title: "Delete Note",
      message: "Are you sure you want to delete this note? This cannot be undone.",
      tone: "danger",
      noticeTitle: "Permanent action",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      confirmVariant: "destructive",
    });
  });
});

describe("getDeleteFileDialogCopy", () => {
  it("interpolates the filename into the message", () => {
    const copy = getDeleteFileDialogCopy("site-photo.jpg");
    expect(copy.title).toBe("Delete File");
    expect(copy.message).toBe(
      'Are you sure you want to delete "site-photo.jpg"? This cannot be undone.',
    );
    expect(copy.confirmVariant).toBe("destructive");
  });
});

describe("getActionErrorDialogCopy — extra branches", () => {
  it("treats whitespace-only message as empty and falls back", () => {
    const copy = getActionErrorDialogCopy({
      title: "Failed",
      fallbackMessage: "Something went wrong.",
      message: "   ",
    });
    expect(copy.message).toBe("Something went wrong.");
  });
});
