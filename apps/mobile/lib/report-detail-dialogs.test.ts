import { describe, expect, it } from "vitest";
import {
  getDeleteReportDialogCopy,
  getReportActionErrorDialogCopy,
} from "./report-detail-dialogs";

describe("getDeleteReportDialogCopy", () => {
  it("returns destructive confirmation copy for report deletion", () => {
    expect(getDeleteReportDialogCopy()).toEqual({
      title: "Delete Report",
      message: "This report will be permanently deleted. This cannot be undone.",
      tone: "danger",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
  });
});

describe("getReportActionErrorDialogCopy", () => {
  it("builds delete failure copy with the provided message", () => {
    expect(
      getReportActionErrorDialogCopy("delete", "Row-level security denied the request."),
    ).toEqual({
      title: "Delete Failed",
      message: "Row-level security denied the request.",
      tone: "danger",
      confirmLabel: "Done",
    });
  });

  it("falls back to the default save/export failure message when one is not provided", () => {
    expect(getReportActionErrorDialogCopy("save")).toEqual({
      title: "Save Failed",
      message: "Could not generate PDF.",
      tone: "danger",
      confirmLabel: "Done",
    });

    expect(getReportActionErrorDialogCopy("export")).toEqual({
      title: "Export Failed",
      message: "Could not generate PDF.",
      tone: "danger",
      confirmLabel: "Done",
    });
  });
});
