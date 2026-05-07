# Media Pipeline Overhaul — Design

Status: **DRAFT — design only, not yet implemented**
Author: architect (review needed before any PRs land)
Stack baseline (verified `apps/mobile/package.json`):
Expo SDK **55**, RN 0.83.4, React 19.2, `expo-camera` **not installed**,
`expo-file-system` 55.0.16, `expo-image-manipulator` 55.0.15,
`expo-image-picker` 55.0.19, `@tanstack/react-query` 5.90,
`@react-native-async-storage/async-storage` 2.2.0, `react-native-blob-util`
0.24.7. **No** `zustand`, `mmkv`, `expo-task-manager`,
`expo-background-fetch`, `notifee`, `expo-build-properties`.

Verified gaps:
- `app.json:35-40` — Android permissions list does NOT include
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`.
- `app.json` — no `expo-build-properties` plugin, so `largeHeap` cannot
  be set today.
- `apps/mobile/hooks/useProjectFiles.ts:273-291` — base64 → `Uint8Array`
  upload (the OOM hot-path on Android).
- `apps/mobile/components/account/AvatarUploader.tsx:35-73` — same
  pattern duplicated inline.
- `apps/mobile/lib/pick-project-file.ts:50` and
  `app/projects/[projectId]/reports/generate.tsx:985` — deprecated
  `MediaTypeOptions.Images`.
- `app/projects/[projectId]/reports/generate.tsx:852-1039` — already
  has an in-component optimistic upload state machine
  (`pendingPhotos` + `runPhotoUpload`) that this design subsumes and
  generalizes.

---

## A. Architecture

```
                      ┌──────────────────────────────────────┐
                      │  apps/mobile/app/(camera)/capture.tsx │
                      │  CameraScreen (expo-camera modal)    │
                      │  - burst capture                     │
                      │  - in-screen preview strip           │
                      │  - returns string[] of local URIs    │
                      └──────────────┬───────────────────────┘
                                     │ router.back() w/ params
                                     │ (or in-memory hand-off)
                                     ▼
                ┌────────────────────────────────────────────┐
                │  generate.tsx / AvatarUploader / future    │
                │  callers                                   │
                │  for each uri:                             │
                │     enqueueUpload({ uri, projectId,        │
                │                     reportId, kind })      │
                └──────────────┬─────────────────────────────┘
                               │
                               ▼
       ┌────────────────────────────────────────────────────┐
       │  lib/uploads/queue.ts  (UploadQueue — singleton)   │
       │  ┌──────────────────────────────────────────────┐  │
       │  │ in-memory Map<jobId, UploadJob>              │  │
       │  │ + persisted snapshot (AsyncStorage)          │  │
       │  │ + EventEmitter ('change' | 'progress')       │  │
       │  └──────────────────────────────────────────────┘  │
       │                                                    │
       │  state machine per job:                            │
       │   pending → preprocessing → uploading              │
       │           → uploaded | failed (retryable)          │
       └──────────────┬─────────────────────────────────────┘
                      │
                      ▼
       ┌────────────────────────────────────────────────────┐
       │  lib/uploads/uploader.ts                           │
       │  - preprocess (existing preprocess-image.ts)       │
       │  - sign URL via Supabase                           │
       │  - FileSystem.createUploadTask(signedUrl,          │
       │       { httpMethod:'PUT',                          │
       │         sessionType: BACKGROUND  /* iOS only */ }) │
       │  - on completion → insert file_metadata row        │
       └──────────────┬─────────────────────────────────────┘
                      │
                      ▼
       ┌────────────────────────────────────────────────────┐
       │  Supabase Storage (project-files / avatars)        │
       │  + file_metadata row (with upload_status column)   │
       └──────────────┬─────────────────────────────────────┘
                      │ Postgres notify / RQ invalidation
                      ▼
       ┌────────────────────────────────────────────────────┐
       │  React Query cache  ['project-files', projectId]   │
       │  ['report-notes', reportId]                        │
       │  generate.tsx re-renders → optimistic placeholder  │
       │  swaps to real row via id match.                   │
       └────────────────────────────────────────────────────┘

   Hooks layer:
     useUploadQueue()      → subscribes to emitter, returns [] of jobs
     useUploadProgress(id) → returns 0..1 for one job
     enqueueUpload(input)  → fire-and-forget; survives unmount
```

### State management — recommendation

**Module-level singleton queue + small EventEmitter, surfaced via a thin
`useSyncExternalStore` hook.** Reasoning:

- Repo already has TanStack Query (5.90) and AsyncStorage; **no Zustand,
  no MMKV** today. Don't add a new state lib for one feature.
- React Query is the wrong tool for a long-running, ordered, persistent
  job queue: its mutation cache is per-component and mutations are
  garbage-collected after `gcTime`. Background uploads must outlive any
  React tree.
- A module-level queue fits the existing patterns: `lib/file-upload.ts`
  is already a pure module, and `useFileUpload()` is a thin RQ wrapper
  on top of it. We keep that boundary.
- `useSyncExternalStore` gives us a 12-line subscription hook with the
  right tearing semantics for React 19 concurrent rendering. No new
  dependency.
- The queue **invalidates** the existing RQ keys on completion, so the
  rest of the app (FileCard, timeline) keeps working unchanged.

### Persistence — recommendation

**AsyncStorage**, single key `harpa.uploads.queue.v1`, debounced JSON
write on every state transition (200ms). Reasoning:

- Already installed (`@react-native-async-storage/async-storage` 2.2.0).
- Job records are tiny (~300 bytes each) and we cap the queue at 50
  jobs; total < 20 KB even worst-case. No need for SQLite.
- MMKV would be faster but adding a native module just for queue
  persistence is not worth a dev-client rebuild.
- The actual file bytes live as on-disk URIs in the cache directory —
  we persist only metadata + URI strings. On app restart we verify each
  URI still exists with `FileSystem.getInfoAsync` and drop ghosts.

---

## B. Camera screen design

### Location & routing

- New route: **`apps/mobile/app/(camera)/capture.tsx`**.
- New layout: `apps/mobile/app/(camera)/_layout.tsx` declaring
  `presentation: "fullScreenModal"`, `headerShown: false`,
  `animation: "slide_from_bottom"`. Existing layouts (`reports/_layout.tsx`)
  use `Stack` with `headerShown: false`; this matches the codebase style.
- Why a route group `(camera)`, not nested under `projects/[projectId]`:
  the camera is reusable from `AvatarUploader`, future "add icon", and
  the report screen. Routing globally keeps the modal state independent
  of which screen launched it.
- Hand-off: `router.push({ pathname: "/(camera)/capture", params: {
  returnTo, sessionId } })`; results posted to a tiny module-level
  `cameraSessionRegistry` (Map keyed by `sessionId`) which the caller
  reads on `useFocusEffect`. Rationale: passing arrays of file URIs via
  router params is unsafe (URL-encoding, length limits); a registry is
  simpler than a global event.

### UI

Match the AppDialogSheet visual language but full-screen:

```
┌────────────────────────────────────────┐
│  ✕ Cancel                  ⚡ flash     │  ← 56pt top bar, dark blur
│                                         │
│                                         │
│            <CameraView>                 │  ← fills, aspect 4:3 letterboxed
│                                         │
│                                         │
│                                         │
│  ┌──┬──┬──┬──┐                  ↻ flip │  ← thumbnail strip (left)
│  │T1│T2│T3│..│ tap=preview, long=delete │     flip cam (right)
│  └──┴──┴──┴──┘                          │
│                                         │
│             ●  shutter                  │  ← centred, 72pt
│                                         │
│  3 photos              [   Done   ]     │  ← bottom action bar
└────────────────────────────────────────┘
```

- **Shutter**: large circular button. Disabled while previous capture
  is still being written to disk. On press: haptic light, scale animation,
  immediate JPEG write to cache dir, append to `captured` state array.
- **Thumbnail strip**: `FlashList` (already a transitive dep of
  `expo-router`/RN) is overkill; use `ScrollView horizontal` with up to
  20 thumbnails. Long-press → confirm delete sheet (uses existing
  `AppDialogSheet`).
- **Done**: posts `string[]` of local URIs back via `cameraSessionRegistry`
  and calls `router.back()`.
- **Cancel**: confirms via `AppDialogSheet` if `captured.length > 0`,
  otherwise just `router.back()`. Discarded captures are deleted from
  cache dir (best-effort).

### Permission handling

- On first focus: `Camera.useCameraPermissions()` (the official hook in
  `expo-camera`).
- If denied: full-screen empty state "Camera access is off" + "Open
  Settings" button calling `Linking.openSettings()` (already used
  elsewhere — check `lib/auth.ts` for the pattern).
- We **must** keep `NSCameraUsageDescription` (already in `app.json:20`)
  and add `expo-camera`'s config plugin so the iOS Info.plist additions
  the SDK needs are wired automatically.

### Orientation

- Lock the camera screen to portrait (the rest of the app is portrait —
  `app.json:6`). Use `<Stack.Screen options={{ orientation: 'portrait' }}/>`
  via `expo-router` — needs `react-native-screens` orientation support
  (already installed, 4.23.0).
- Capture EXIF orientation flag is preserved by `expo-camera` and
  `expo-image-manipulator` strips it after rotation, matching the
  existing preprocess-image behaviour. No extra work.

### `<CameraView>` props

```ts
<CameraView
  ref={cameraRef}
  style={StyleSheet.absoluteFill}
  facing={facing}            // 'back' | 'front'
  flash={flash}              // 'off' | 'on' | 'auto'
  mode="picture"             // not 'video'
  pictureSize="1920x1080"    // Android; iOS picks closest preset
  responsiveOrientationWhenOrientationLocked={false}
  // NB: do NOT set `enableTorch` for picture mode; flash above handles it.
/>
```

`takePictureAsync({ quality: 0.9, skipProcessing: false, exif: false,
imageType: 'jpg' })` — `quality: 0.9` because we re-encode in
`preprocessImageForUpload` anyway; `skipProcessing: false` to keep
correct rotation; `exif: false` to drop GPS metadata before it ever
hits disk (privacy).

---

## C. Upload pipeline

### Module layout

```
apps/mobile/lib/uploads/
  queue.ts           // singleton + persistence + emitter
  jobs.ts            // pure types + state-machine reducer
  preprocess-step.ts // wraps preprocessImageForUpload for the queue
  uploader.ts        // FileSystem.createUploadTask integration
  blob.ts            // uri → Blob | uri → ArrayBuffer (NEW, tested)
  index.ts           // public API
apps/mobile/hooks/
  useUploadQueue.ts  // useSyncExternalStore wrapper
  useUploadProgress.ts
```

### Public API

```ts
export type UploadKind = 'project-image' | 'avatar' | 'document';

export interface EnqueueInput {
  kind: UploadKind;
  sourceUri: string;          // ph:// or file:// or content://
  projectId?: string;
  reportId?: string | null;
  uploadedBy: string;         // user.id
  // hint to skip preprocess for non-image kinds
  isImage: boolean;
}

export interface UploadJob {
  id: string;                 // uuid v4
  state: 'pending' | 'preprocessing' | 'uploading'
       | 'uploaded' | 'failed' | 'cancelled';
  attempts: number;
  lastError?: string;
  progress: number;           // 0..1, only populated during 'uploading'
  // resolved during preprocessing:
  localUri?: string;          // working file in cache (post-resize)
  thumbnailUri?: string;
  width?: number;
  height?: number;
  blurhash?: string | null;
  // resolved on success:
  fileId?: string;            // file_metadata.id
  storagePath?: string;
  createdAt: number;
  input: EnqueueInput;
}

export function enqueueUpload(input: EnqueueInput): string;   // returns jobId
export function cancelUpload(jobId: string): void;
export function retryUpload(jobId: string): void;
export function subscribe(listener: () => void): () => void;
export function getJobs(): UploadJob[];
export function getJob(id: string): UploadJob | undefined;
```

### State machine

```
                      enqueueUpload()
                            │
                            ▼
                       ┌─────────┐
                       │ pending │
                       └────┬────┘
              run-loop picks next
                            ▼
                  ┌─────────────────┐
                  │  preprocessing  │
                  │ (resize+thumb)  │
                  └────┬────────┬───┘
                       │        │ unrecoverable
                       ▼        ▼
                  ┌─────────┐  ┌────────┐
                  │uploading│  │ failed │
                  │(PUT 5xx │  └───┬────┘
                  │ retries)│      │ retryUpload()
                  └──┬───┬──┘      ▼
                     │   │     ┌─────────┐
              success│   │fail │ pending │
                     ▼   ▼     └─────────┘
                ┌──────┐ ┌────────┐
                │uploaded│ │ failed │
                └──────┘ └────────┘
```

- **Concurrency**: single-flight per device. Two parallel uploads on
  cellular makes both slower (TCP fairness) and complicates progress
  UI. Only the foreground state of the queue is parallelisable; the
  background session is implicitly serial on Android (one
  `WorkManager` task) and parallel on iOS (NSURLSession decides).
- **Retry**: exponential backoff `min(60s, 2^attempts * 1s)` on
  network/5xx errors; max **5 attempts**, then `failed`. 4xx (auth,
  validation) → `failed` immediately, no retry. User can tap retry in
  the upload tray UI to reset to `pending`.
- **Preprocess** runs **inside the queue**, not at the call site.
  Reasons: (1) preprocess is CPU-heavy and shouldn't block the camera
  shutter; (2) keeping it in the queue lets us recover preprocessing
  after app kill (we re-derive from `sourceUri` which is the
  camera-cache JPEG); (3) `pickProjectFile` and `AvatarUploader` get
  identical behaviour for free.

### Blob conversion

```ts
// blob.ts
export async function uriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
    // iOS PhotoKit URIs cannot be fetch()ed. Copy to cache first.
    const dest = `${FileSystem.cacheDirectory}upload-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    uri = dest;
  }
  // RN's fetch() supports file:// and content://
  const r = await fetch(uri);
  return await r.blob();
}
```

> **Uncertainty (please verify)**: I am ~90% sure RN 0.83's `fetch` on
> `ph://` URIs throws. The `expo-camera` capture path returns a
> `file://` URI, so for the new flow we never hit this; the iOS-photo-
> picker path does. The fallback above is safe either way.

### Progress + transport — recommendation

**Use `expo-file-system`'s `createUploadTask` against a Supabase
**signed upload URL**, not `supabase.storage.from(b).upload()`**. Why:

- Supabase JS v2's `upload()` does not expose progress callbacks (still
  open issue at the time of writing — verify before implementation).
- `createUploadTask` exposes `(progress) => …` and supports
  `sessionType: 'background'` on iOS (verify against
  expo-file-system 55 docs — see §I).
- We get access to the uploaded `path` via the response and then run
  the `file_metadata` insert manually, exactly as `uploadProjectFile`
  does today.

Flow:
1. Call `supabase.storage.from(bucket).createSignedUploadUrl(path)` →
   returns `{ signedUrl, token, path }`.
2. `FileSystem.createUploadTask(signedUrl, localUri, {
   httpMethod: 'PUT', headers: { authorization: \`Bearer ${token}\`,
   'x-upsert': 'false' }, uploadType: BINARY_CONTENT, sessionType: BACKGROUND })`.
3. On 200 → call `from('file_metadata').insert(...)` (small JSON, no
   bytes — fine to do via the JS client).

### TUS vs simple PUT

- Simple PUT (signed URL) below **25 MB** — covers every image we
  produce (post-resize a 2048px JPEG q=0.85 is typically 300–800 KB).
- TUS resumable above **25 MB** — for documents/voice notes only.
  Supabase Storage natively supports the TUS protocol (`/upload/resumable`).
  We will not implement TUS in PR-1; track as a follow-up.

---

## D. Background upload — honest reality check

### Android — recommendation

**Use a config plugin to add `expo-build-properties` + a real
foreground service via `WorkManager`**. Specifically:

1. Add `expo-build-properties` (new dep).
2. `app.json` plugin entry:
   ```json
   ["expo-build-properties", {
     "android": {
       "largeHeap": true,
       "compileSdkVersion": 35,
       "targetSdkVersion": 35
     }
   }]
   ```
3. `app.json` Android permissions add:
   - `android.permission.FOREGROUND_SERVICE`
   - `android.permission.FOREGROUND_SERVICE_DATA_SYNC` (Android 14+)
   - `android.permission.POST_NOTIFICATIONS` (Android 13+)
4. **Library choice**: `expo-task-manager` + `expo-background-fetch`
   are NOT sufficient for "survive app kill while uploading 20 MB"
   — `expo-background-fetch` runs short opportunistic windows, not a
   persistent foreground service. `notifee` provides notification
   primitives but does not run upload work. The realistic options:

   | Option | Survives app kill? | Pure managed? | Effort |
   |---|---|---|---|
   | A. `expo-file-system` `createUploadTask` only | ❌ Android kills the process when backgrounded under memory pressure (the bug we're fixing) | ✅ | low |
   | B. + `notifee` foreground service host | ✅ if user does not swipe-kill | ⚠ needs config plugin | medium |
   | C. Custom Kotlin `Service` via local config plugin wrapping `WorkManager` | ✅ true survival incl. swipe-kill | ❌ requires native code | high |
   | D. `react-native-background-upload` (Vydia) | ✅ via WorkManager internally | ⚠ needs autolinking + config | medium |

   **Recommendation: B (notifee foreground service) for PR-1**, with
   D evaluated as fallback if Samsung lmkd still kills us.
   `notifee.registerForegroundService` keeps the JS runtime alive while
   the notification is shown; combined with `largeHeap: true` and the
   memory savings from streamed uploads, this should be enough for the
   2 MP capture sizes we produce. We explicitly do NOT promise survival
   across "swipe app off recents".

5. Notification: persistent, non-dismissable (`ongoing: true`),
   channel `uploads`, importance LOW (no sound), text
   "Uploading N photos…" with a progress bar (`progress: { max:100,
   current: pct, indeterminate: false }`). Icon: reuse the monochrome
   adaptive icon (`./assets/android-icon-monochrome.png` — already
   referenced).

### iOS — recommendation

`expo-file-system` 55 exposes `FileSystem.createUploadTask(url, fileUri,
{ sessionType: FileSystemSessionType.BACKGROUND })`. Per Apple's docs,
this becomes an `NSURLSession` background config, which:

- Continues uploads after the app is suspended.
- **Does not** continue if the user force-quits the app from the app
  switcher (Apple-enforced).
- Reports completion via the system to the app on next launch.

> **Uncertainty (please verify against expo-file-system 55 source)**:
> the API name and shape have shifted across SDKs. Confirm
> `FileSystem.createUploadTask` is the correct entry point in 55 (it
> may now be `File.createUploadTask` under the new `File` API). If the
> new API only supports foreground sessions, we fall back to the
> legacy `expo-file-system/legacy` import for this feature only.

`Info.plist` additions: **none required** beyond what Expo adds for
`expo-file-system` (which itself wires the AppDelegate completion
handler `application:handleEventsForBackgroundURLSession:completionHandler:`).
Do not set `UIBackgroundModes` — that is for app-controlled background
fetch, not NSURLSession background config.

### What's actually achievable in pure managed Expo?

- ✅ iOS background upload: yes, via `expo-file-system` background
  session — no ejection.
- ⚠ Android "survive backgrounding": yes via `notifee` config plugin,
  but `notifee` is a community module that will require a **dev-client
  rebuild** (no Expo Go). The repo already runs dev clients
  (`scripts.start = "expo start --dev-client"` in `package.json:6`),
  so this is acceptable.
- ❌ Android "survive swipe-kill" without writing Kotlin: not reliable.
  We document this limitation; if it becomes a real user complaint,
  PR-N replaces notifee's foreground service host with a small custom
  config plugin wrapping `WorkManager` (Option C).

---

## E. Data flow with the report draft

`generate.tsx` already runs an in-component optimistic state machine
(`pendingPhotos` array, `runPhotoUpload`, see lines 164–1039). It
already chose **option (i): optimistic placeholder, swap on completion**.
This design generalizes that pattern out of the component and into the
queue.

**Recommendation: option (i), formalized.**

- On `enqueueUpload()`, immediately optimistically insert a
  **`file_metadata` row with `upload_status = 'pending'`** and
  `storage_path = NULL`. The placeholder row has the same `id` the
  upload will eventually carry, so the UI can render off it.
- The optimistic row's `report_notes` link is also created
  immediately, so submitting the report while the upload is in flight
  Just Works.
- The Edge Function that generates the AI report **must filter
  `upload_status = 'completed'`** when collecting attached images, so
  we never feed the LLM a half-uploaded reference. Worst case: the
  report is generated without the slow-uploading photo; the photo
  appears in the report's source-notes list afterward. This matches
  the user's "submit and forget" mental model better than blocking on
  network.
- On upload completion, the queue runs an **UPDATE** to the existing
  row (`storage_path`, `thumbnail_path`, `width`, `height`,
  `blurhash`, `upload_status = 'completed'`, `size_bytes`).
- On terminal failure: `upload_status = 'failed'`. The UI shows a
  retry chip. The row is never auto-deleted — user decides.

Why not (ii) "block submit": punishes the user for slow networks and
defeats the whole point of background uploads.

Why not (iii) "stitch later in backend": requires a new Edge Function
+ webhook + reconciliation queue; (i) is simpler and equally correct.

---

## F. RLS / database impact

### New columns on `file_metadata`

```sql
-- 202605080001_file_metadata_upload_status.sql
ALTER TABLE public.file_metadata
  ADD COLUMN upload_status text NOT NULL DEFAULT 'completed'
    CHECK (upload_status IN ('pending', 'completed', 'failed')),
  ADD COLUMN local_uri text NULL;          -- client-only debugging aid

-- existing rows are 'completed' (DEFAULT handles backfill).

-- relax the NOT NULL on storage_path? NO — keep it NOT NULL.
-- Instead the optimistic insert writes a placeholder path
-- '__pending__/<uuid>' and the UPDATE on completion rewrites it.
-- Reasoning: avoids a schema-wide nullable change and keeps every
-- existing reader honest.
```

### RLS policies

No policy changes are needed for `INSERT` (unchanged: `uploaded_by =
auth.uid()`). However:

- **The completion `UPDATE` is now a write the client performs on a
  row owned by the same user.** The existing `file_metadata` UPDATE
  policy (verify in the latest `file_upload_storage` migration) must
  permit `uploaded_by = auth.uid()` to update `storage_path`,
  `thumbnail_path`, `width`, `height`, `blurhash`, `size_bytes`,
  `upload_status`. If today's policy is more restrictive (e.g. only
  permits soft-delete via RPC), we add a new policy or a
  `SECURITY DEFINER` RPC `complete_file_upload(p_file_id, …)`.
- **Per AGENTS.md RLS test rule**: any change in client write paths
  requires a new `supabase/tests/rls_file_metadata_upload_status.test.ts`
  that exercises:
  1. Owner can INSERT with `upload_status='pending'`.
  2. Owner can UPDATE their own pending row to completed.
  3. Other-project user cannot UPDATE the pending row.
  4. Direct UPDATE of `upload_status='completed' → 'pending'` by the
     owner is rejected (one-way state machine — enforce via CHECK or
     trigger).

### Migration filename

`supabase/migrations/202605080001_file_metadata_upload_status.sql`
(timestamp pattern `YYYYMMDDHHmm_description.sql` per AGENTS.md).

---

## G. Testing strategy

### Vitest (unit)

- `lib/uploads/jobs.test.ts` — pure state-machine reducer:
  pending→preprocessing→uploading→uploaded; retry transitions;
  attempt cap; 4xx vs 5xx routing.
- `lib/uploads/blob.test.ts` — `uriToBlob` URI-scheme branching;
  mock `fetch` and `FileSystem.copyAsync`.
- `lib/uploads/queue.test.ts` — persistence round-trip
  (AsyncStorage in-memory mock); ghost detection; subscribe/notify;
  cancel during preprocessing vs uploading.
- `lib/preprocess-image.test.ts` — already exists; extend with
  large-image (8000×6000) plan calculation; verify `planResize`
  returns identity when source already fits.
- Mock seam for the uploader: `uploader.ts` takes a `Deps` object
  `{ backend, fileSystem, now }` so tests inject fakes — same pattern
  as `lib/file-upload.ts`'s `BackendLike`.

### Maestro E2E

- `apps/mobile/.maestro/camera-capture.flow.yaml` — happy path:
  open report, tap camera, capture × 3, tap Done, assert 3
  thumbnails appear in the photo strip.
- `apps/mobile/.maestro/camera-permission-denied.flow.yaml` —
  simulator with camera permission revoked → assert "Open Settings"
  CTA renders.
- **Background-during-upload is not realistically testable in
  Maestro.** Maestro can `pressKey: HOME` but cannot reliably trigger
  the OS-level memory-pressure kill we're fixing. We document this
  gap and rely on a manual QA checklist (§J) + logcat assertions in
  PR-3.

### RLS

- `supabase/tests/rls_file_metadata_upload_status.test.ts` — see §F.

---

## H. Implementation sequencing

Each chunk is a single PR, mergeable independently to `dev`.

### PR-1 — Infra: streamed Blob uploads + build properties (low risk)

- Replace `readBytes()` base64 path in `useProjectFiles.ts` and
  `AvatarUploader.tsx` with the new `lib/uploads/blob.ts` `uriToBlob`.
- Migrate `MediaTypeOptions.Images` → `mediaTypes: ['images']` in the
  two call sites.
- Add `expo-build-properties` plugin with `largeHeap: true`.
- Add `expo-camera` to dependencies (no UI use yet).
- **Tests**: unit tests for `uriToBlob`; existing `useProjectFiles`
  tests updated.
- **Effort**: 0.5d. **Risk**: low. Touches 2 components, no schema.
- **Ship-stops**: dev-client rebuild required.

### PR-2 — Migration: `file_metadata.upload_status` + RLS (low risk)

- New migration (§F).
- New `supabase/tests/rls_*.test.ts`.
- No mobile code changes — column has DEFAULT.
- **Effort**: 0.5d. **Risk**: low.

### PR-3 — Upload queue scaffolding (medium risk, no UI)

- `lib/uploads/{queue,jobs,uploader,preprocess-step}.ts` + hooks.
- `useFileUpload` becomes a thin wrapper that calls `enqueueUpload`
  and observes the resulting job (back-compat shim — same return
  type).
- All uploads now go through the queue, but uploads still happen in
  the foreground (no background session yet).
- **Tests**: full Vitest suite for queue + jobs.
- **Effort**: 2d. **Risk**: medium — touches every upload path.
- **Depends on**: PR-1, PR-2.

### PR-4 — Camera screen (medium risk, isolated UI)

- `app/(camera)/capture.tsx` + layout.
- `cameraSessionRegistry` module.
- Wire `generate.tsx` to push to camera screen instead of calling
  `ImagePicker.launchCameraAsync`. Each returned URI is enqueued.
- **Tests**: Maestro happy-path + permission-denied.
- **Effort**: 2d. **Risk**: medium — new native dep (`expo-camera`).
- **Depends on**: PR-1 (expo-camera installed), PR-3 (queue).

### PR-5 — iOS background uploads (medium risk)

- Switch `uploader.ts` to `FileSystem.createUploadTask` with
  `sessionType: BACKGROUND` (iOS only via `Platform.OS === 'ios'`).
- Verify and document the actual API in expo-file-system 55.
- **Tests**: manual QA on physical iPhone — capture, background app,
  verify upload completes; relaunch, verify completion handler
  reconciles queue state.
- **Effort**: 1.5d. **Risk**: medium.
- **Depends on**: PR-3.

### PR-6 — Android foreground service via notifee (high risk)

- Add `@notifee/react-native`, register foreground service in app
  entry, surface progress notifications.
- Add Android permissions to `app.json` (§D).
- **Tests**: manual QA on Samsung device that originally crashed.
- **Effort**: 2d. **Risk**: high — first foreground service in repo.
- **Depends on**: PR-3.

### PR-7 — Optimistic placeholder rows + report-flow integration (medium risk)

- Switch enqueue path to immediately INSERT `file_metadata` with
  `upload_status='pending'`.
- Update `generate.tsx` to remove the local `pendingPhotos` state —
  use `useUploadQueue()` instead.
- Update report-generation Edge Function to filter `upload_status =
  'completed'` (verify path: likely `supabase/functions/generate-report`).
- **Tests**: extend RLS tests; update Vitest for `useFileUpload`
  back-compat behaviour.
- **Effort**: 1.5d. **Risk**: medium — touches AI flow.
- **Depends on**: PR-2, PR-3.

### PR-8 — Polish, docs, retry UI (low risk)

- Upload-tray UI in the app shell (collapsed badge in tab bar showing
  "↑ N").
- `docs/10-media-pipeline.md` (this doc) finalized.
- `docs/02-deployment.md` updates: new native deps require dev-client
  rebuild + new EAS build for prod.
- `docs/09-testing.md`: document Maestro gap for background uploads.
- **Effort**: 1d. **Risk**: low.

**Total**: ~11 dev-days, 8 PRs, sequenced over 2–3 weeks.

---

## I. Open questions / risks

1. **iOS `ph://` → Blob**: covered by `uriToBlob` fallback (copy-to-cache).
   But on PR-1 we should add a manual smoke test on iPhone choosing a
   photo from the library, since RN's `fetch(ph://...)` behaviour has
   changed across versions. **Verify on RN 0.83.**
2. **`expo-image-manipulator` peak memory** during resize of a 48 MP
   Samsung capture: this is the original crash. Mitigations: (a) limit
   capture to 1920×1080 (`pictureSize`) so manipulator never sees a
   huge bitmap; (b) `largeHeap: true`. Together, peak heap should drop
   from ~600 MB to <200 MB. **Validate with Android profiler post-PR-4.**
3. **Foreground notification UX**: text "Uploading N photos…", icon
   = monochrome adaptive icon, channel `uploads`, importance LOW
   (no sound/vibration). The notification **cannot be dismissed**
   while the service is alive — Android-enforced. We dismiss it
   programmatically when queue drains.
4. **User logs out mid-upload**: queue's `subscribe(authState)`
   listener cancels all in-flight jobs and clears the persisted queue
   on `SIGNED_OUT`. Already-uploaded bytes in Storage are orphaned but
   the metadata row never gets the completion UPDATE → cleanup job
   sweeps storage paths whose `upload_status` stays 'pending' for >24h.
5. **JWT expiry during long upload**: signed upload URLs are valid
   for the lifetime granted by Supabase (default ~2h for
   `createSignedUploadUrl`). The HTTP request itself doesn't carry a
   user JWT — only the signed URL token. So token refresh during the
   upload PUT is irrelevant. The follow-on `file_metadata` UPDATE
   uses the JS client which auto-refreshes. **One edge case**: if the
   upload completes while the app is dead and the user's session has
   since expired, the post-launch reconciliation step retries the
   UPDATE; if it 401s, we mark the job `failed` and require manual
   retry after re-auth. Document this.
6. **Android lmkd swipe-kill**: notifee's foreground service raises
   the OOM score class but does NOT make the process unkillable when
   the user explicitly swipes from recents. Documented limitation.

---

## J. Documentation updates required

- **NEW** `docs/10-media-pipeline.md` (this file, finalized in PR-8).
- **UPDATE** `docs/02-deployment.md`:
  - Note that PR-1 + PR-4 + PR-6 each require a fresh dev-client and
    a new prod EAS build (native module changes — no OTA).
  - Add `expo-build-properties` and `expo-camera` to the "native
    deps that require a build" list.
  - Document the Android `largeHeap` tradeoff (heap up to ~512 MB
    instead of 192 MB; counts against the per-app cap, may cause
    other parts of the app to be slower to GC).
- **UPDATE** `docs/09-testing.md`:
  - Add a "Background uploads" subsection explaining the Maestro gap
    and the manual-QA-on-physical-device requirement.
  - Reference the new RLS test file pattern.
- **UPDATE** `supabase/tests/README.md`: list the new
  `rls_file_metadata_upload_status.test.ts` and the
  one-way-state-machine assertion pattern (first time we use it in
  this repo — worth documenting for reuse).
- **CONSIDER** updating the top-level `AGENTS.md` once PR-6 lands to
  document `notifee` as the canonical foreground-service module for
  the repo.

---

## Appendix — explicit non-goals

- TUS resumable uploads (deferred).
- Multi-device upload sync (uploads are device-local; no cross-device
  resume).
- Video capture (still just images).
- Upload analytics / telemetry beyond logcat. We will not add an
  analytics pipeline as part of this work.
- Replacing `expo-image-picker` for the photo-library path. `<CameraView>`
  replaces only the **camera** path; library picking still uses
  `launchImageLibraryAsync` with the SDK 55 syntax.
