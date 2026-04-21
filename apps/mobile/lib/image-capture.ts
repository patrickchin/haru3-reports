// Image capture pipeline: picker -> EXIF extract -> HEIC convert ->
// resize original -> generate thumbnail -> enqueue for upload.
//
// EXIF must be extracted from the picker result BEFORE running the
// manipulator, which strips metadata.

import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { uploadQueue, type QueuedImage } from "./image-upload-queue";
import type { ReportImageLinkedTo } from "./report-image-types";

const ORIGINAL_MAX_EDGE = 2400;
const ORIGINAL_QUALITY = 0.85;
const THUMB_MAX_EDGE = 400;
const THUMB_QUALITY = 0.7;

export type CaptureSource = "camera" | "library";

export interface CaptureOptions {
  reportId: string;
  projectId: string;
  source: CaptureSource;
  linkedTo: ReportImageLinkedTo;
  sortOrder: number;
  caption?: string | null;
}

export interface CaptureResult {
  queued: QueuedImage;
}

/** Pick or capture a photo, process it, and enqueue it for upload. */
export async function captureAndEnqueueImage(
  options: CaptureOptions,
): Promise<CaptureResult | null> {
  const picked = await pickPhoto(options.source);
  if (!picked) return null;

  const queued = await processAndEnqueue({
    asset: picked,
    reportId: options.reportId,
    projectId: options.projectId,
    linkedTo: options.linkedTo,
    sortOrder: options.sortOrder,
    caption: options.caption ?? null,
  });

  return { queued };
}

async function pickPhoto(
  source: CaptureSource,
): Promise<ImagePicker.ImagePickerAsset | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    // exif needed for GPS + DateTimeOriginal.
    exif: true,
    // Don't pre-compress: we do our own resize for consistent output.
    quality: 1,
  };

  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera permission denied");
    const result = await ImagePicker.launchCameraAsync(opts);
    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0];
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Photo library permission denied");
  const result = await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}

interface ProcessParams {
  asset: ImagePicker.ImagePickerAsset;
  reportId: string;
  projectId: string;
  linkedTo: ReportImageLinkedTo;
  sortOrder: number;
  caption: string | null;
}

async function processAndEnqueue({
  asset,
  reportId,
  projectId,
  linkedTo,
  sortOrder,
  caption,
}: ProcessParams): Promise<QueuedImage> {
  // 1. Extract EXIF (GPS + timestamp) before manipulator strips it.
  const { latitude, longitude, takenAt } = extractExif(asset.exif ?? null);

  // 2. Resize/convert original.
  const originalResize = pickResize(asset.width, asset.height, ORIGINAL_MAX_EDGE);
  const originalResult = await ImageManipulator.manipulateAsync(
    asset.uri,
    originalResize ? [{ resize: originalResize }] : [],
    {
      compress: ORIGINAL_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  // 3. Thumbnail.
  const thumbResize = pickResize(asset.width, asset.height, THUMB_MAX_EDGE);
  const thumbResult = await ImageManipulator.manipulateAsync(
    asset.uri,
    thumbResize ? [{ resize: thumbResize }] : [],
    {
      compress: THUMB_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  // 4. Copy to a stable cache location tied to our generated id. The
  //    manipulator returns tmp URIs that may be purged; we want ours.
  const id = generateUuid();
  const cacheDir = `${FileSystem.cacheDirectory}report-images/`;
  await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });

  const localUri = `${cacheDir}${id}.jpg`;
  const localThumbUri = `${cacheDir}${id}_thumb.jpg`;
  await FileSystem.copyAsync({ from: originalResult.uri, to: localUri });
  await FileSystem.copyAsync({ from: thumbResult.uri, to: localThumbUri });

  // 5. Get final file size.
  const info = await FileSystem.getInfoAsync(localUri, { size: true });
  const sizeBytes = info.exists && "size" in info ? (info.size ?? 0) : 0;

  const queued: QueuedImage = {
    id,
    reportId,
    projectId,
    localUri,
    localThumbUri,
    mimeType: "image/jpeg",
    sizeBytes,
    width: originalResult.width,
    height: originalResult.height,
    caption,
    latitude,
    longitude,
    takenAt,
    linkedTo,
    sortOrder,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };

  await uploadQueue.enqueue(queued);
  return queued;
}

function pickResize(
  width: number,
  height: number,
  maxEdge: number,
): { width?: number; height?: number } | null {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  if (width >= height) return { width: maxEdge };
  return { height: maxEdge };
}

interface ExtractedExif {
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
}

function extractExif(exif: Record<string, unknown> | null): ExtractedExif {
  if (!exif) return { latitude: null, longitude: null, takenAt: null };

  const latitude = readNumber(exif.GPSLatitude) ?? readNumber(exif.latitude);
  const longitude = readNumber(exif.GPSLongitude) ?? readNumber(exif.longitude);
  // Prefer DateTimeOriginal (capture time); fall back to DateTime.
  const rawDate =
    readString(exif.DateTimeOriginal) ??
    readString(exif.DateTime) ??
    null;
  const takenAt = parseExifDate(rawDate);

  return { latitude, longitude, takenAt };
}

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// EXIF dates are "YYYY:MM:DD HH:MM:SS" (note the colons in the date part).
function parseExifDate(raw: string | null): string | null {
  if (!raw) return null;
  const iso = raw.replace(
    /^(\d{4}):(\d{2}):(\d{2})/,
    (_, y, m, d) => `${y}-${m}-${d}`,
  );
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function generateUuid(): string {
  // RFC4122 v4. Good enough for client-generated ids; DB never trusts them
  // for auth (RLS uses auth.uid()), only for dedupe.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
