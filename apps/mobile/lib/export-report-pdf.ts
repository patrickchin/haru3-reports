import * as Linking from "expo-linking";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import type { GeneratedSiteReport } from "./generated-report";
import { reportToHtml, type PdfBranding, type PdfPhoto } from "./report-to-html";
import { backend } from "./backend";
import { reportImageFromRow } from "./report-image-types";

const reportsDir = new Directory(Paths.document, "Harpa Pro", "reports");
const OPEN_PDF_ERROR_MESSAGE =
  "Could not open the saved PDF. Use Share PDF to choose another app.";

/** Sign URLs valid for 48h so recipients can open attached HTML files. */
const PHOTO_URL_TTL_SECONDS = 48 * 60 * 60;

async function loadPhotosForReport(reportId: string): Promise<PdfPhoto[]> {
  const { data, error } = await backend
    .from("report_images")
    .select("*")
    .eq("report_id", reportId)
    .order("sort_order", { ascending: true });
  if (error || !data || data.length === 0) return [];
  const images = data.map(reportImageFromRow);

  // Prefer thumbnails for the appendix grid to keep file size manageable.
  const signed = await Promise.all(
    images.map(async (img) => {
      const path = img.thumbnailPath ?? img.storagePath;
      const { data: s } = await backend.storage
        .from("report-images")
        .createSignedUrl(path, PHOTO_URL_TTL_SECONDS);
      if (!s?.signedUrl) return null;
      return {
        url: s.signedUrl,
        caption: img.caption,
        linkedTo: img.linkedTo,
      } satisfies PdfPhoto;
    }),
  );
  return signed.filter((p): p is PdfPhoto => p !== null);
}

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
  pdfFilename: string;
  htmlUri?: string;
  locationDescription?: string;
  shareErrorMessage?: string;
}

interface SaveReportPdfOptions {
  siteName?: string | null;
}

interface ShareSavedReportPdfOptions {
  pdfUri: string;
  reportTitle: string;
}

interface SavedReportDetails {
  title: string;
  locationDescription: string;
  fullPath: string;
  openHint: string;
  shareHint: string;
}

interface GeneratedPdfArtifacts {
  html: string;
  htmlFilename: string;
  pdfFilename: string;
  tempPdfFile: File;
}

export function getSavedReportFullPath(pdfUri: string): string {
  if (!pdfUri.startsWith("file://")) {
    return decodeURIComponent(pdfUri);
  }

  try {
    return decodeURIComponent(new URL(pdfUri).pathname);
  } catch {
    return pdfUri;
  }
}

function getReportDatePrefix(report: GeneratedSiteReport): string {
  const visitDate = report.report.meta.visitDate?.trim();

  if (visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return visitDate;
  }

  if (visitDate) {
    const parsedDate = new Date(visitDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function getSiteDirectoryName(siteName?: string | null): string {
  return sanitizeFilename(siteName?.trim() ?? "") || "site-reports";
}

function describeDocumentsSave(siteDirectoryName: string, pdfFilename: string): string {
  return `Saved as ${pdfFilename} in documents/Harpa Pro/reports/${siteDirectoryName}.`;
}

function getPdfShareOptions(reportTitle: string) {
  return {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: reportTitle,
  } as const;
}

function getShareUnavailableMessage(pdfUri: string): string {
  if (Platform.OS === "web") {
    return "PDF export is not supported on web.";
  }

  return "The PDF was generated, but sharing is not available on this device.";
}

export function getSavedReportDetails({
  locationDescription,
  pdfUri,
}: {
  locationDescription: string;
  pdfUri: string;
}): SavedReportDetails {
  return {
    title: "PDF Saved",
    locationDescription,
    fullPath: getSavedReportFullPath(pdfUri),
    openHint: "Open PDF uses your device's PDF handler for the saved file.",
    shareHint: "Share PDF sends the same file to another app.",
  };
}

export async function openSavedReportPdf(pdfUri: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Opening saved PDFs is not supported on web.");
  }

  const pdfFile = new File(pdfUri);
  const openUri =
    Platform.OS === "android" && pdfFile.contentUri ? pdfFile.contentUri : pdfUri;

  try {
    await Linking.openURL(openUri);
  } catch {
    throw new Error(OPEN_PDF_ERROR_MESSAGE);
  }
}

export async function shareSavedReportPdf({
  pdfUri,
  reportTitle,
}: ShareSavedReportPdfOptions): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(getShareUnavailableMessage(pdfUri));
  }

  await Sharing.shareAsync(pdfUri, getPdfShareOptions(reportTitle));
}

async function generateReportPdfArtifacts(
  report: GeneratedSiteReport,
  branding?: PdfBranding,
  reportId?: string,
): Promise<GeneratedPdfArtifacts> {
  const photos = reportId ? await loadPhotosForReport(reportId) : [];
  const html = reportToHtml(report, branding, photos);
  const { uri: tempUri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const basename = sanitizeFilename(report.report.meta.title) || "report";
  const datePrefix = getReportDatePrefix(report);
  const filenameBase = `${datePrefix}-${basename}`;

  return {
    html,
    htmlFilename: `${filenameBase}.html`,
    pdfFilename: `${filenameBase}.pdf`,
    tempPdfFile: new File(tempUri),
  };
}

function ensureSiteReportsDir(siteName?: string | null): Directory {
  ensureReportsDir();
  const siteDirectory = new Directory(reportsDir, getSiteDirectoryName(siteName));
  siteDirectory.create({ intermediates: true, idempotent: true });
  return siteDirectory;
}

/**
 * Generate a PDF from a report and save it persistently to the app's
 * documents directory under reports/<site>. Returns the URIs for both the
 * PDF and HTML files.
 */
export async function saveReportPdf(
  report: GeneratedSiteReport,
  options: SaveReportPdfOptions = {},
  branding?: PdfBranding,
  reportId?: string,
): Promise<ExportedReport> {
  if (Platform.OS === "web") {
    throw new Error("Saving PDFs is not supported on web.");
  }

  const { html, htmlFilename, pdfFilename, tempPdfFile } = await generateReportPdfArtifacts(
    report,
    branding,
    reportId,
  );
  const siteDirectoryName = getSiteDirectoryName(options.siteName);
  const siteDirectory = ensureSiteReportsDir(options.siteName);
  const pdfFile = new File(siteDirectory, pdfFilename);
  const htmlFile = new File(siteDirectory, htmlFilename);

  try {
    tempPdfFile.move(pdfFile);
    htmlFile.create({ intermediates: true });
    htmlFile.write(html);

    return {
      pdfUri: pdfFile.uri,
      pdfFilename,
      htmlUri: htmlFile.uri,
      locationDescription: describeDocumentsSave(siteDirectoryName, pdfFilename),
    };
  } finally {
    if (tempPdfFile.exists) {
      tempPdfFile.delete();
    }
  }
}

/**
 * Save a report PDF locally and then open the native share sheet.
 */
export async function exportReportPdf(
  report: GeneratedSiteReport,
  options: SaveReportPdfOptions = {},
  branding?: PdfBranding,
  reportId?: string,
): Promise<ExportedReport> {
  const result = await saveReportPdf(report, options, branding, reportId);

  try {
    await shareSavedReportPdf({
      pdfUri: result.pdfUri,
      reportTitle: report.report.meta.title,
    });
  } catch (error) {
    return {
      ...result,
      shareErrorMessage:
        error instanceof Error ? error.message : getShareUnavailableMessage(result.pdfUri),
    };
  }

  return result;
}
