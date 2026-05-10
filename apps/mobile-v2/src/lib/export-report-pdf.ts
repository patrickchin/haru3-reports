/**
 * PDF export for reports using expo-print + expo-sharing.
 * Simplified from v1 for mobile-v2.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { GeneratedSiteReport } from "@harpa/report-core";
import { reportToHtml, type PdfBranding } from "./report-to-html";

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
}

function getReportDatePrefix(report: GeneratedSiteReport): string {
  const visitDate = report.report.meta.visitDate?.trim();
  if (visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return visitDate;
  }
  return new Date().toISOString().slice(0, 10);
}

export interface ExportedPdf {
  uri: string;
  filename: string;
}

/**
 * Generate PDF and return URI for in-app viewing or sharing.
 */
export async function generateReportPdf(
  report: GeneratedSiteReport,
  branding?: PdfBranding
): Promise<ExportedPdf> {
  if (Platform.OS === "web") {
    throw new Error("PDF export is not supported on web.");
  }

  const html = reportToHtml(report, branding);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const basename = sanitizeFilename(report.report.meta.title) || "report";
  const datePrefix = getReportDatePrefix(report);
  const filename = `${datePrefix}-${basename}.pdf`;

  return { uri, filename };
}

/**
 * Share PDF via system share sheet.
 */
export async function shareReportPdf(
  pdfUri: string,
  reportTitle: string
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(pdfUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: reportTitle,
  });
}
