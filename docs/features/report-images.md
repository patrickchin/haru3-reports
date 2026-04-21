# Report Images — MVP Plan

> Written 21 Apr 2026.
> Status: proposed, not yet implemented.

Adds photo capture and attachment to reports. Field users take photos alongside voice notes; photos are stored separately from the AI-generated report JSON and surfaced in the mobile UI and (as an appendix) in HTML/PDF exports.

---

## 1. Goals & Non-Goals

**Goals (MVP)**
- Capture photos via camera or pick from library during report creation.
- Offline-first: photos survive app kill and upload when connectivity returns.
- Per-user RLS, per-report scoping, thumbnails to save bandwidth.
- Optional caption and soft-linkage to an activity.
- Lightbox viewer on mobile; appendix gallery in HTML export.
- Storage-provider abstraction so we can swap Supabase Storage for S3 / GCS / R2 later.

**Non-goals (deferred)**
- Sending images to the LLM (vision). Cost and placement reliability are uncertain.
- Inline image placement inside activity sections of HTML/PDF.
- AI-generated captions.
- PII detection / face blurring.
- Server-side image processing pipeline.
- Web-client capture (mobile-only for now).

---

## 2. Data Model

### 2.1 New table: `report_images`

```
report_images
├── id              uuid PK
├── report_id       uuid FK → reports.id  ON DELETE CASCADE
├── owner_id        uuid FK → profiles.id ON DELETE CASCADE
├── storage_path    text        — bucket-relative path of the original
├── thumbnail_path  text | null — bucket-relative path of the thumbnail
├── caption         text | null — user-supplied
├── latitude        float8 | null — from EXIF GPS
├── longitude       float8 | null — from EXIF GPS
├── taken_at        timestamptz | null — EXIF DateTimeOriginal
├── mime_type       text        — "image/jpeg" after conversion
├── size_bytes      int         — original file size
├── width           int | null
├── height          int | null
├── linked_to       text | null — "activity:{index}" or null (top-level)
├── sort_order      int not null default 0
├── created_at      timestamptz not null default now()
```

- Indexes: `(report_id, sort_order)`, `(owner_id)`.
- RLS: `owner_id = auth.uid()` for all operations, mirroring `reports`.
- `linked_to` scope for MVP: `"activity:{N}"` or `null` only. Issue-level and nested linkage are deferred.

### 2.2 JSONB `report_data` — unchanged

No fields added to `GeneratedSiteReport`. The LLM prompt and Zod schema stay exactly as they are. Images are a sibling relation of the report, not embedded content.

### 2.3 Known limitation: activity reordering

`linked_to` stores a positional index into `report.activities[]`. If a regenerated report reorders activities, the link drifts. Accepted for MVP because:

- Activities are rarely reordered in practice.
- `applyReportPatch` uses match-by-name, so order is mostly stable.
- Mitigation path: once activities have stable IDs (a separate refactor), migrate `linked_to` to `"activity:{id}"`.

---

## 3. Storage Layer

### 3.1 MVP: Supabase Storage

- Single private bucket: `report-images`.
- Path convention: `{project_id}/{report_id}/{image_id}.jpg` (original) and `{project_id}/{report_id}/{image_id}_thumb.jpg` (thumbnail).
- RLS on `storage.objects` keyed off the `owner_id` of the parent `reports` row (path-based policy matching the first path segment against a project the user owns).

### 3.2 Provider abstraction

```
interface ImageStorageProvider {
  upload(localUri: string, path: string, mimeType: string): Promise<void>;
  getSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  delete(paths: string[]): Promise<void>;
}
```

- Concrete impls behind this interface: `SupabaseStorageProvider` (MVP), `S3StorageProvider`, `GCSStorageProvider`, `R2StorageProvider` later.
- Wired via a single factory that reads config; no call-sites change on swap.

### 3.3 Thumbnails

Generated client-side with `expo-image-manipulator` before upload. Both original and thumbnail are uploaded by the same queue item, so a report image is never partially available.

- Thumbnail: ~400px on the long edge, JPEG quality 0.7.
- Original: HEIC converted to JPEG quality 0.85, long edge capped at ~2400px to bound upload size.

### 3.4 Delete cascade

`ON DELETE CASCADE` cleans the DB row when a report is deleted, but Supabase Storage does not auto-cascade. Two options:

- **Preferred:** a Postgres trigger on `report_images` DELETE that enqueues the paths for deletion via an edge function or `pg_net`.
- **Fallback:** perform storage deletion in the mobile client before deleting the DB row.

For MVP, implement the client-side fallback. Record a TODO to move to a trigger-driven cleanup once volume grows.

---

## 4. Offline-First Upload Queue

```
capture/pick
    │
    ▼
save file to FileSystem.cacheDirectory/report-images/{uuid}.jpg
save thumbnail to FileSystem.cacheDirectory/report-images/{uuid}_thumb.jpg
append queue item to AsyncStorage key `report-images:queue`
    │
    ▼
upload worker (runs on: app foreground, new item, NetInfo online event)
    │
    ▼
for each pending item:
  1. upload original
  2. upload thumbnail
  3. insert report_images row
  4. on success → mark done, purge local file (keep thumbnail briefly for UI)
  5. on failure → exponential backoff, max retries, surface a banner after N failures
```

Queue item shape:

```
{
  id: uuid,
  reportId: uuid,
  localUri: string,
  localThumbUri: string,
  mimeType: "image/jpeg",
  sizeBytes: number,
  width: number, height: number,
  caption: string | null,
  latitude: number | null, longitude: number | null,
  takenAt: string | null,
  linkedTo: "activity:N" | null,
  status: "pending" | "uploading" | "done" | "failed",
  attempts: number,
  lastError: string | null,
}
```

- AppState already drives other flows in `generate.tsx`; reuse it.
- While the queue item is pending, the UI renders from `localUri`. Once uploaded, it renders from a signed URL.

---

## 5. Capture & Attach UX

```
user taps camera button
    │
    ├── action sheet: [Take Photo] [Choose from Library] [Cancel]
    │
    ▼
expo-image-picker (exif: true)
    │
    ▼
extract EXIF (GPS, DateTimeOriginal) BEFORE manipulation
convert HEIC → JPEG, resize, generate thumbnail
    │
    ▼
"Attach to ‘{lastActivityName}’?"   ← compact inline prompt
  [Yes]  [Choose activity…]  [Skip (top-level)]
    │
    ▼
optional caption input (inline, can be added later)
    │
    ▼
enqueue; thumbnail appears under target activity or in appendix gallery
```

### Attach-suggestion heuristic

- If there are no activities yet, `linked_to = null` (top-level) and no prompt.
- Otherwise, suggest the **last activity in `report.activities[]`**. This is the most recently generated, which correlates with the note the user was just dictating.
- If the user dismisses without answering, default to `linked_to = null`. Never auto-assign silently to an activity.

### Captions

- Optional at capture time; editable later from the thumbnail lightbox.
- Plain text, single line suggested, no length limit enforced at the API.

### Permissions

- iOS `Info.plist`: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription` (for optional GPS).
- Android manifest: `CAMERA`, `READ_MEDIA_IMAGES` (API 33+), `ACCESS_FINE_LOCATION` (optional).

---

## 6. Mobile UI Components

| Component | Purpose |
|-----------|---------|
| `ImageCaptureButton` | Toolbar button on the generate screen; opens action sheet. |
| `ImageAttachSheet` | Bottom sheet with the attach-suggestion prompt. |
| `ImageThumbnailStrip` | Horizontal `FlatList` of thumbnails inside an `ActivityCard`. |
| `ImageGalleryAppendix` | Grid of unlinked images at the bottom of `ReportView`. |
| `ImageLightbox` | Full-screen pager, caption overlay, delete action. |
| `UploadStatusBadge` | Per-thumbnail overlay: pending / uploading / failed. |

`ReportView` changes are additive: new strips inside each `ActivityCard`, a new `ImageGalleryAppendix` at the bottom.

---

## 7. HTML / PDF Rendering

For MVP the report body stays image-free. A new appendix section is appended to `reportToHtml`:

```
N. Photo Documentation
  Grouped by linked activity name, then "General" for unlinked.
  Thumbnail grid (signed URLs, 48 h expiry).
  Caption below each thumbnail.
  No inline placement in activity or issue sections.
```

Deferred: inline images next to the activity or issue they belong to, and proper PDF embedding.

---

## 8. Dependencies

| Package | Purpose |
|---------|---------|
| `expo-image-picker` | Camera + library picker, EXIF extraction. |
| `expo-image-manipulator` | HEIC→JPEG, resize, thumbnail. |
| `expo-file-system` | Local cache for queued items. |
| `@react-native-community/netinfo` | Connectivity events for the upload worker. |

---

## 9. Migration & Rollout

1. New migration `202604210001_report_images.sql` — table, indexes, RLS, storage bucket setup (`supabase/config.toml` or SQL).
2. Add storage-provider interface and `SupabaseStorageProvider`.
3. Add upload queue (`lib/image-upload-queue.ts`) with AsyncStorage persistence.
4. Add `useReportImages(reportId)` hook (React Query) that merges server-side rows with local queue items.
5. Wire `ImageCaptureButton` into the generate screen.
6. Extend `ReportView` components with thumbnail strips and the appendix gallery.
7. Extend `reportToHtml` with the photo appendix.
8. Tests: unit tests for queue state machine, EXIF parsing, provider contract, and the attach heuristic.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large uploads on poor connections | Client compresses to ~800 KB typical; exponential backoff; user-visible failed state. |
| `linked_to` drifts when activities reorder | Accepted; migrate to stable IDs later. |
| Supabase Storage quota | Monitor; provider abstraction lets us move hot data elsewhere without app changes. |
| HEIC conversion slow on old devices | `expo-image-manipulator` is native; acceptable. Offer a “queuing...” state. |
| Orphan storage objects after delete | Client-side cascade now, Postgres trigger later. |
| EXIF stripped by manipulation | Extract EXIF *before* running the manipulator. |

---

## 11. Open Questions (not blocking MVP)

- Should we expose a per-project retention policy?
- Do we want a cheap always-on thumbnail CDN, or rely on signed URLs?
- At what volume do we move thumbnail generation to a server worker?
- Is vision-LLM placement worth the token cost for a future iteration?
