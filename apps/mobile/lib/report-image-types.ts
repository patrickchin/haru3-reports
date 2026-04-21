// Client-side types for report images (paralleling the `report_images` DB row).
//
// A `ReportImage` is the canonical record once uploaded. While an image is
// still queued locally, it is represented by a `QueuedImage` (see
// lib/image-upload-queue.ts) whose shape is a superset.

export type ReportImageLinkedTo = string | null; // "activity:{index}" | "issue:{index}" | null

export interface ReportImage {
  id: string;
  reportId: string;
  ownerId: string;
  storagePath: string;
  thumbnailPath: string | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  linkedTo: ReportImageLinkedTo;
  sortOrder: number;
  /** 1-based index of the note that preceded capture (0 if before any). */
  afterNoteIndex: number;
  createdAt: string;
}

// Shape of the `timeline` column on reports. Notes are referenced by 1-based
// index into reports.notes[]; photos are referenced by report_images.id.
export type TimelineEntry =
  | { kind: "note"; id: number; createdAt: string }
  | { kind: "photo"; id: string; createdAt: string };

export type Timeline = TimelineEntry[];

// Maps a DB row (snake_case) to our camelCase type.
export function reportImageFromRow(row: {
  id: string;
  report_id: string;
  owner_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  linked_to: string | null;
  sort_order: number;
  after_note_index: number;
  created_at: string;
}): ReportImage {
  return {
    id: row.id,
    reportId: row.report_id,
    ownerId: row.owner_id,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    caption: row.caption,
    latitude: row.latitude,
    longitude: row.longitude,
    takenAt: row.taken_at,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    linkedTo: row.linked_to,
    sortOrder: row.sort_order,
    afterNoteIndex: row.after_note_index,
    createdAt: row.created_at,
  };
}
