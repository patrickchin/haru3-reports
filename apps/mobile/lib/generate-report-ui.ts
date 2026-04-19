export function getGenerateReportTabLabel(
  tab: "notes" | "report",
  notesCount: number
): string {
  if (tab === "notes") {
    return `Notes (${notesCount})`;
  }

  return "Report";
}
