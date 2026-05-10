export function getGenerateReportTabLabel(
  tab: "notes" | "report" | "edit",
  notesCount: number
): string {
  if (tab === "notes") {
    return `Notes (${notesCount})`;
  }

  if (tab === "edit") {
    return "Edit";
  }

  return "Report";
}
