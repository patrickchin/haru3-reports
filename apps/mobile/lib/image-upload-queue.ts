// Offline-first upload queue for report images.
//
// Items are persisted to AsyncStorage so uploads survive app kills.
// A single worker drains the queue; it is invoked on:
//   - new item added
//   - app foreground (AppState change)
//   - network connectivity change (NetInfo)
//
// Rendering: while an item is `pending` | `uploading` | `failed`, the UI
// renders from `localThumbUri`. Once `done`, it renders from a signed URL.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { backend } from "./backend";
import {
  buildImageStoragePath,
  getImageStorageProvider,
} from "./image-storage-provider";
import type { ReportImage, ReportImageLinkedTo } from "./report-image-types";

const STORAGE_KEY = "report-images:queue";
const MAX_ATTEMPTS = 5;
// 1s, 2s, 4s, 8s, 16s
const BACKOFF_MS = (attempt: number) => Math.min(16_000, 1_000 * 2 ** attempt);

export type QueuedImageStatus =
  | "pending"
  | "uploading"
  | "done"
  | "failed";

export interface QueuedImage {
  id: string;
  reportId: string;
  projectId: string;
  localUri: string;
  localThumbUri: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
  linkedTo: ReportImageLinkedTo;
  sortOrder: number;
  /** 1-based note index at capture time; 0 if before any notes. */
  afterNoteIndex: number;
  status: QueuedImageStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

type QueueListener = (items: QueuedImage[]) => void;

class UploadQueue {
  private items: QueuedImage[] = [];
  private loaded = false;
  private draining = false;
  private listeners = new Set<QueueListener>();

  async load(): Promise<void> {
    if (this.loaded) return;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    this.items = raw ? (JSON.parse(raw) as QueuedImage[]) : [];
    // Any item that was mid-upload when the app died should retry.
    for (const item of this.items) {
      if (item.status === "uploading") item.status = "pending";
    }
    this.loaded = true;
    this.notify();
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.items);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Items for a given report, in sort order, stable by createdAt. */
  getForReport(reportId: string): QueuedImage[] {
    return this.items
      .filter((i) => i.reportId === reportId)
      .sort((a, b) =>
        a.sortOrder !== b.sortOrder
          ? a.sortOrder - b.sortOrder
          : a.createdAt.localeCompare(b.createdAt),
      );
  }

  async enqueue(item: QueuedImage): Promise<void> {
    await this.load();
    this.items.push(item);
    await this.persist();
    this.notify();
    // Fire-and-forget drain; don't block caller.
    void this.drain();
  }

  async updateLinkedTo(id: string, linkedTo: ReportImageLinkedTo): Promise<void> {
    await this.load();
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.linkedTo = linkedTo;
    await this.persist();
    this.notify();
  }

  async updateCaption(id: string, caption: string | null): Promise<void> {
    await this.load();
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.caption = caption;
    await this.persist();
    this.notify();
  }

  async remove(id: string): Promise<void> {
    await this.load();
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
    this.notify();
  }

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      await this.load();
      // Copy to iterate safely while mutating.
      const snapshot = [...this.items];
      for (const item of snapshot) {
        if (item.status !== "pending" && item.status !== "failed") continue;
        if (item.attempts >= MAX_ATTEMPTS) continue;
        await this.uploadOne(item);
      }
    } finally {
      this.draining = false;
    }
  }

  /** Force a single item to retry (resets failure state). */
  async retry(id: string): Promise<void> {
    await this.load();
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.status = "pending";
    item.attempts = 0;
    item.lastError = null;
    await this.persist();
    this.notify();
    void this.drain();
  }

  private async uploadOne(item: QueuedImage): Promise<void> {
    const provider = getImageStorageProvider();
    item.status = "uploading";
    await this.persist();
    this.notify();

    const originalPath = buildImageStoragePath(
      item.projectId,
      item.reportId,
      item.id,
      "original",
    );
    const thumbPath = buildImageStoragePath(
      item.projectId,
      item.reportId,
      item.id,
      "thumb",
    );

    try {
      await provider.upload({
        localUri: item.localUri,
        path: originalPath,
        mimeType: item.mimeType,
      });
      await provider.upload({
        localUri: item.localThumbUri,
        path: thumbPath,
        mimeType: "image/jpeg",
      });

      // Insert the DB row. RLS ensures owner_id matches auth.uid().
      const { data: user } = await backend.auth.getUser();
      const ownerId = user.user?.id;
      if (!ownerId) throw new Error("Not authenticated");

      const { error } = await backend.from("report_images").insert({
        id: item.id,
        report_id: item.reportId,
        owner_id: ownerId,
        storage_path: originalPath,
        thumbnail_path: thumbPath,
        caption: item.caption,
        latitude: item.latitude,
        longitude: item.longitude,
        taken_at: item.takenAt,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
        width: item.width,
        height: item.height,
        linked_to: item.linkedTo,
        sort_order: item.sortOrder,
        after_note_index: item.afterNoteIndex,
      });
      if (error) throw error;

      item.status = "done";
      item.lastError = null;
    } catch (err) {
      item.attempts += 1;
      item.lastError = err instanceof Error ? err.message : String(err);
      item.status = item.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      // Non-blocking backoff so we don't hammer when retrying within one drain.
      if (item.status === "pending") {
        await new Promise((r) => setTimeout(r, BACKOFF_MS(item.attempts)));
      }
    } finally {
      await this.persist();
      this.notify();
    }
  }

  private async persist(): Promise<void> {
    // Purge `done` items from disk once they're also present in the DB
    // query cache. For MVP, keep them in memory until the hook drops them;
    // they're light and get pruned on next reload.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
  }

  private notify(): void {
    for (const l of this.listeners) l(this.items);
  }
}

export const uploadQueue = new UploadQueue();

/**
 * Convert a queued image into a `ReportImage`-shaped object for rendering
 * while the upload is still in-flight. `storagePath`/`thumbnailPath` are
 * substituted with the local file URIs so the UI can use them directly.
 */
export function queuedImageAsReportImage(item: QueuedImage): ReportImage & {
  __pending: true;
  status: QueuedImageStatus;
} {
  return {
    id: item.id,
    reportId: item.reportId,
    ownerId: "",
    storagePath: item.localUri,
    thumbnailPath: item.localThumbUri,
    caption: item.caption,
    latitude: item.latitude,
    longitude: item.longitude,
    takenAt: item.takenAt,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    width: item.width,
    height: item.height,
    linkedTo: item.linkedTo,
    sortOrder: item.sortOrder,
    afterNoteIndex: item.afterNoteIndex,
    createdAt: item.createdAt,
    __pending: true,
    status: item.status,
  };
}
