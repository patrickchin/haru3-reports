import { describe, expect, it } from "vitest";
import {
  getActionErrorDialogCopy,
  getDeleteDraftDialogCopy,
  getDeleteProjectDialogCopy,
  getDeleteReportDialogCopy,
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
