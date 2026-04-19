import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Directory, Paths } from "expo-file-system";
import { Alert, Platform } from "react-native";
import type { GeneratedSiteReport } from "./generated-report";
import { reportToHtml, type PdfBranding } from "./report-to-html";

const reportsDir = new Directory(Paths.document, "reports");

function sanitizeFilename(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
}

function ensureReportsDir(): void {
  reportsDir.create({ intermediates: true, idempotent: true });
}

export interface ExportedReport {
  pdfUri: string;
  htmlUri: string;
}

/**
 * Generate a PDF from a report and save it persistently to the app's
 * documents directory. Returns the URIs for both the PDF and HTML files.
 */
export async function saveReportPdf(
  report: GeneratedSiteReport,
  branding?: PdfBranding
): Promise<ExportedReport> {
  const html = reportToHtml(report, branding);

  const { uri: tempUri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  ensureReportsDir();

  const basename = sanitizeFilename(report.report.meta.title) || "report";
  const timestamp = Date.now();
  const pdfFilename = `${basename}-${timestamp}.pdf`;
  const htmlFilename = `${basename}-${timestamp}.html`;

  const tempFile = new File(tempUri);
  const pdfFile = new File(reportsDir, pdfFilename);
  tempFile.move(pdfFile);

  const htmlFile = new File(reportsDir, htmlFilename);
  htmlFile.create({ intermediates: true });
  htmlFile.write(html);

  return { pdfUri: pdfFile.uri, htmlUri: htmlFile.uri };
}

/**
 * Save a report PDF locally and then open the native share sheet.
 */
export async function exportReportPdf(
  report: GeneratedSiteReport,
  branding?: PdfBranding
): Promise<ExportedReport> {
  const result = await saveReportPdf(report, branding);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.pdfUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: report.report.meta.title,
    });
  } else {
    Alert.alert(
      "PDF Saved",
      Platform.OS === "web"
        ? "PDF export is not supported on web."
        : "The PDF has been saved but sharing is not available on this device."
    );
  }

  return result;
}
