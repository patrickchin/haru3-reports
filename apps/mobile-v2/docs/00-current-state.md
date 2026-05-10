# **Current-State Inventory: apps/mobile/**
---

## **1. Numbers at a Glance**

| Category | Count | Notes |
|----------|-------|-------|
| Routes | 23 | `.tsx` files in app/ (expo-router file-based) |
| Components | 72+ | Across subdirs: reports/, voice-notes/, files/, members/, notes/, ui/, uploads/, account/, skeletons/ |
| Hooks | 22+ | Custom React hooks for data pipelines |
| Lib modules | 94+ | Pure logic, utilities, helpers, state machines |
| Tests | 40+ | Unit + E2E Maestro flows |
| **Total LOC** | ~22,500 | Non-test code across app/, components/, hooks/, lib/ |

**Per-directory LOC:**
- `app/`: ~1,500 (routes, layout, screens)
- `components/`: ~8,000 (UI, cards, dialogs)
- `hooks/`: ~3,000 (React Query, data pipelines)
- `lib/`: ~10,000 (pure logic, file ops, state machines)

**Hotspot files:**
- [ReportEditForm.tsx](apps/mobile/components/reports/ReportEditForm.tsx) – ~800 LOC (god component, form for 7 sections)
- [VoiceNoteCard.tsx](apps/mobile/components/voice-notes/VoiceNoteCard.tsx) – ~550 LOC (playback UI + 3 dialogs)
- [lib/uploads/queue.ts](apps/mobile/lib/uploads/queue.ts) – ~450 LOC (upload state machine runtime)
- [AudioPlaybackProvider.tsx](apps/mobile/lib/audio/AudioPlaybackProvider.tsx) – ~450 LOC (voice playback lifecycle)

---

## **2. Route Map**

| Route | File | Feature | Key Actions | Depth |
|-------|------|---------|-------------|-------|
| `/` | index.tsx | Root redirect | Check auth → projects or onboarding | 0 |
| `/onboarding` | onboarding.tsx | Signup form | fullName, companyName, phone → profile | 1 |
| `/(tabs)/projects` | (tabs)/projects.tsx | Project list | List, tap to enter, + new project FAB | 2 |
| `/projects/[projectId]/reports/[reportId]` | [reportId].tsx | Report detail (read) | Tabs: view, edit, notes, source; PDF export | 4 |
| `/projects/[projectId]/reports/generate` | generate.tsx | Report compose (draft) | Tabs: notes, report, edit, debug; AI generation | 4 |
| `/(camera)/capture` | (camera)/capture.tsx | Camera roll | Capture/pick photos, organize before upload | 2 |
| `/account` | account.tsx | Settings | Profile, logout, cache clear, app info | 2 |
| `/usage` | usage.tsx | Token dashboard | Credits, LLM usage by model, history | 2 |
| `/e2e/login` | e2e/login.tsx | **Dev-only** deep-link | `?demo=0\|1\|2` → seeded user sign-in | 1 |

**Notable patterns:**
- File-based routing via expo-router (e.g., `[projectId]` for dynamic segments).
- Tab layouts via `_layout.tsx` files.
- Deeplink: `harpa://e2e/login?demo=0` for fast Maestro login.

---

## **3. Feature Inventory**

### **Auth & Onboarding**  
- **What**: Phone OTP, signup, session persistence, seed users (E2E)  
- **Key files**: [lib/auth.tsx](apps/mobile/lib/auth.tsx), [lib/auth-security.ts](apps/mobile/lib/auth-security.ts)  
- **Supabase**: `auth.signInWithPassword()`, `profiles` table (RLS)  
- **Deps**: @supabase/supabase-js, expo-crypto (with Hermes fallback)

### **Projects**  
- **What**: Create, list, edit (members, visibility), delete  
- **Key files**: [hooks/useLocalProjects.ts](apps/mobile/hooks/useLocalProjects.ts)  
- **Supabase**: `projects` table, `project_members` (role-based RLS)

### **Reports (Draft + Finalized)**  
- **What**: Create, edit sections, view, finalize, delete drafts  
- **Key files**: [lib/report-edit-helpers.ts](apps/mobile/lib/report-edit-helpers.ts), [lib/generated-report.ts](apps/mobile/lib/generated-report.ts)  
- **Immutability**: All state changes return NEW wrapper + report object  
- **Supabase**: `site_reports` table, finalize RPC

### **Notes Timeline (Text, Voice, File)**  
- **What**: Add text notes, voice recordings, file attachments; timeline view during compose  
- **Key files**: [components/notes/NoteTimeline.tsx](apps/mobile/components/notes/NoteTimeline.tsx), [hooks/useLocalReportNotes.ts](apps/mobile/hooks/useLocalReportNotes.ts)  
- **Pending-row bridge** (R11): Timeline tracks pending notes from upload queue to render optimistic cards  
- **Supabase**: `report_notes` table (text/voice/file links), soft delete via `deleted_at`

### **Voice Notes (Record → Transcribe → Summarize → Playback)**  
- **Record**: [useSpeechToText.ts](apps/mobile/hooks/useSpeechToText.ts) via expo-audio  
- **Transcribe**: [voice-note-flow.ts](apps/mobile/lib/voice-note-flow.ts) → edge function `transcribe-audio`  
- **Summarize**: [useSummarizeVoiceNote.ts](apps/mobile/hooks/useSummarizeVoiceNote.ts) → edge function `summarize-voice-note` (>400 chars auto-trigger)  
- **Playback**: [AudioPlaybackProvider.tsx](apps/mobile/lib/audio/AudioPlaybackProvider.tsx) (screen-scoped, single player, audio ducking)  
- **Fixtures**: Mocked via `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true`

### **Photo & Document Upload**  
- **Pipeline**: Pick → preprocess (resize + thumbnail + blurhash) → queue → upload to Storage → link to report  
- **Key files**: [lib/uploads/queue.ts](apps/mobile/lib/uploads/queue.ts), [lib/uploads/uploader.ts](apps/mobile/lib/uploads/uploader.ts), [lib/uploads/jobs.ts](apps/mobile/lib/uploads/jobs.ts)  
- **Architecture**:  
  - **queue.ts**: In-memory Map + AsyncStorage, single-flight worker, subscribers  
  - **jobs.ts**: Pure state machine (pending → preprocessing → uploading → uploaded/failed)  
  - **uploader.ts**: Orchestrates preprocess + blob + upload steps  
  - **iOS background**: NSURLSession via expo-file-system (OS finishes after JS killed)  
  - **Placeholder row pattern**: Insert pending row BEFORE preprocess; flip to completed/failed after  
- **Supabase**: `file_metadata` table, `project_files` bucket, RLS enforces membership

### **Camera**  
- **What**: Launch camera intent → capture photos → return to upload flow  
- **Deps**: expo-camera

### **Members & Permissions**  
- **What**: Invite to project, set role (admin/editor/viewer), remove  
- **Supabase**: `project_members` table, role-based RLS

### **Account & Profile**  
- **What**: Edit profile (name, company, avatar), manage login  
- **Supabase**: `profiles` table, `avatars` bucket

### **Usage & Token Dashboard**  
- **What**: View credits, LLM consumption by model, usage history  
- **Supabase**: `token_usage`, `token_usage_events` tables (RLS hides other users)

### **E2E Harness**  
- **What**: Maestro test automation, deep-link fast login  
- **testID convention**: `btn-action-id`, `dialog-action-type-id`, `voice-note-card-{fileId}`, `pending-photo-{localId}`  
- **Fixture mode**: `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true` mocks transcript server-side  
- **Dev guards**: `isDevPhoneAuthEnabled`, route stub unavailable in prod

---

## **4. Library & Dependency Usage**

| Package | Version | Used In | Load-bearing | Notes |
|---------|---------|---------|--------------|-------|
| @supabase/supabase-js | ^2.99.2 | All data ops | **YES** | Singleton client, Auth + PostgREST |
| @tanstack/react-query | ^5.90.21 | 15+ hooks | **YES** | useQuery, useMutation, caching |
| expo-router | ~55.0.8 | app/**/*.tsx | **YES** | File-based routing |
| expo-audio | ~55.0.14 | Voice playback | **YES** | AudioPlayer, status listener |
| expo-image-manipulator | ~55.0.15 | Image preprocess | YES | Resize, blurhash |
| expo-file-system | ^55.0.16 | Upload queue | **YES** | Blob ops, NSURLSession (iOS) |
| expo-crypto | ~55.0.14 | UUID gen | **YES** | **Hermes quirk**: May not expose globalThis.crypto on iOS release; needs RFC 4122 fallback |
| nativewind | ^4.2.3 | Styling | **YES** | className-based Tailwind |
| react-native | 0.83.4 | Core | **YES** | UI primitives |
| zod | ^4.3.6 | Validation | YES | Report schema |
| lucide-react-native | ^0.577.0 | Icons | YES | ~50+ icons |
| react-native-pdf | ^7.0.4 | PDF preview | YES | PDFView component |
| clsx | ^2.1.1 | className utils | Replaceable | Could use tailwind-merge directly |
| react-native-webview | 13.16.0 | Unknown | Dead? | Not found in grep searches |
| react-native-blob-util | ^0.24.7 | Blob ops | Replaceable? | Overlaps with expo-file-system |
| react-native-reanimated | 4.2.1 | Animations | Replaceable | Only FadeIn; could use native Animated |

---

## **5. Hotspots & Complexity**

**Top 10 largest files:**

| File | LOC | What | Why |
|------|-----|------|-----|
| ReportEditForm.tsx | ~800 | 7-section form + state + dialog | God component; needs splitting |
| VoiceNoteCard.tsx | ~550 | Playback UI + 3 dialogs | Mixed concerns; extract dialogs |
| lib/uploads/queue.ts | ~450 | Upload runtime (state machine) | Correct complexity; well-structured |
| AudioPlaybackProvider.tsx | ~450 | Playback lifecycle, audio ducking | Correct complexity; stateful provider |
| EditTabPane.tsx | ~400 | Edit tab form | Form layout pattern |
| useLocalReports.ts | ~200 | React Query hooks | Intentionally multi-hook |
| FileCard.tsx | ~480 | File card + meta + 3 dialogs | Mixed concerns; extract dialogs |
| uploader.ts | ~200 | Single job orchestration | Procedural; correct complexity |
| report-edit-helpers.ts | ~250 | Pure immutable helpers | Correct pattern; high cohesion |
| lib/uploads/jobs.ts | ~300 | Pure state machine | Correct; fully testable, deterministic |

### **Upload Queue (Subsection)**
- **queue.ts**: In-memory Map + AsyncStorage persistence + single-flight worker loop.
- **jobs.ts**: Pure `reduce(job, event) → newJob` with no I/O (testable without mocks).
- **uploader.ts**: Orchestrates preprocess → blob → upload → optional placeholder row finalize.
- **Key behaviors**: Persistence every 200ms, failed jobs >24h old dropped, iOS background NSURLSession, Android foreground service.

### **Audio Playback (Subsection)**
- **Single shared provider**: One AudioPlayer instance for entire app.
- **Screen-scoped lifecycle**: Tears down when pathname changes (nav away).
- **Audio ducking**: `interruptionMode: "doNotMix"` while playing; `mixWithOthers` on stop so iOS auto-resumes user's music.
- **Listener-driven state**: Subscribed to `playbackStatusUpdate` event (not polling) to prevent desync.

---

## **6. Cross-Cutting Patterns**

### **State Management**
- **React Query**: Preferred for server state (reports, notes, files, projects).
- **Context**: AudioPlaybackProvider for screen-scoped playback.
- **useState**: Form state, dialog visibility, selected tabs.
- **No Redux/Zustand**: Intentionally minimal global state.

### **Forms & Validation**
- **Uncontrolled state**: TextInput → onChange → parent setState.
- **Immutable updates**: report-edit-helpers returns new wrapper + report object (shallow equality).
- **Validation**: zod schema for reports; runtime checks before mutations.

### **Dialogs & Sheets**
- **AppDialogSheet abstraction**: Wraps RN Modal; unifies tone (info/success/warning/danger) + actions + notice.
- **Used by**: ReportEditForm, VoiceNoteCard, FileCard, GenerateReportDialogs.
- **Pattern**: Controlled visibility via useState; actions array with variant + label + onPress.

### **Styling**
- **NativeWind**: className strings compiled to StyleSheet at build time.
- **Design tokens**: [lib/design-tokens/colors.ts](apps/mobile/lib/design-tokens/colors.ts) (primary, destructive, muted, etc.).
- **Config**: `@/` path alias points to repo root.

### **testID Conventions (Maestro)**
- **Pattern**: `btn-action-id`, `dialog-action-type-id`, `voice-note-card-{fileId}`, `pending-photo-{localId}`.
- **No centralized registry**: Convention-based; Maestro test files define expected IDs.
- **Risk**: Renaming testID breaks Maestro flows (must manually update `.maestro/*.yaml` files).

### **Fixture Mode**
- **Flag**: `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true` (inlined at build time; requires rebuild to change).
- **App-side**: [lib/dev-flags.ts](apps/mobile/lib/dev-flags.ts) mocks audio recorder.
- **Server-side**: Edge functions check `USE_FIXTURES=true` env var; return dummy transcripts.

### **Data Fetching**
- **Hooks pattern**: `useLocalReports()`, `useLocalReportNotes()`, `useProjectFiles()` wrap useQuery.
- **Query keys**: Structured arrays (`['reports', projectId]`).
- **Mutations**: Wrapped in hooks; invalidate on success via `queryClient.invalidateQueries()`.

### **Immutability**
- **report-edit-helpers pattern**: Returns `{ ...wrapper, report: { ...report, ...patch } }` for shallow equality.
- **Upload queue**: `reduce()` returns new job object; never mutate in place.

---

## **7. Anti-Patterns & Code Smells**

| Issue | File | Example | Refactor |
|-------|------|---------|----------|
| **God component** | ReportEditForm.tsx | 7 sections + all state + removal dialog | Extract `Section()`, `RoleRow()`, `MaterialRow()` subcomponents |
| **Nested dialogs** | VoiceNoteCard.tsx | 3 AppDialogSheet inline | Extract `VoiceNoteDeleteDialog`, `VoiceNoteOptionsDialog`, `VoiceNoteTranscriptDialog` |
| **Nested dialogs** | FileCard.tsx | 3 AppDialogSheet inline | Same as above |
| **Boolean dialog state** | VoiceNoteCard.tsx | 5 useState for dialogs | Extract dialog manager hook or context |
| **Provider overflow** | GenerateReportProvider.tsx | Report state + mutations + tab switching | Split into state + mutations contexts |
| **Missing error boundary** | app/_layout.tsx | No ErrorBoundary | Add wrapper around Stack.Navigator |
| **RLS off-by-one** | draft-report-actions.ts | Update fails if user loses membership | Document as expected behavior; add comment |

---

## **8. What Works Well & Preserve Verbatim**

1. **Upload queue contract** (queue.ts): Public API + pure reducer is gold; state machine works.
2. **Voice playback architecture** (AudioPlaybackProvider.tsx): Screen-scoped, listener-driven, audio ducking.
3. **Report immutability helpers** (report-edit-helpers.ts): Clean, testable, factories for "Add row" buttons.
4. **testID conventions**: Consistent pattern, Maestro-friendly.
5. **RLS-respecting queries**: Filter by project_id + membership; server enforces.
6. **Soft-delete pattern**: `deleted_at` filter is standard and safe.
7. **Fixture mode plumbing** (dev-flags.ts): Env-var-driven, allows fast E2E.

---

## **9. Hard Constraints**

### **iOS Hermes Crypto Quirk**
- **Issue**: Hermes release builds may not expose `globalThis.crypto`.
- **File**: [lib/uuid.ts](apps/mobile/lib/uuid.ts)
- **Mitigation**: Try `expo-crypto.randomUUID()` first; fallback to RFC 4122-shaped uuidv4. **Never** hand-roll `<time>-<rand>` or PostgREST rejects it.

### **PostgREST 400 Errors**
- **Issue**: Kong logs show no body; PostgREST container shows JSON error.
- **Cause**: Non-existent column in insert OR filter value doesn't parse as column type.
- **Mitigation**: Validate UUIDs before querying; log request payload.

### **Fixture-Mode Flag Plumbing**
- **Issue**: `EXPO_PUBLIC_*` vars inlined by Metro at build time.
- **Constraint**: Build with `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true expo run:ios` (can't change at runtime).
- **Server-side**: Edge functions check `USE_FIXTURES=true` env var.

### **Maestro testID Catalog**
- **Location**: [.maestro/](apps/mobile/.maestro/)
- **Risk**: No central registry; testID rename breaks all flows referencing it.
- **Mitigation**: Search `.maestro/*.yaml` when renaming testIDs.

### **Service Role vs Client Boundary**
- **Pattern**: App always uses anon key + RLS; only server uses service-role key.
- **Constraint**: Never ship service-role key in client bundle.

---

## **TL;DR Summary**

1. **Mature & stable**: Upload queue state machine, audio playback lifecycle, report immutability pattern, RLS design.
2. **Ripe for refactoring**: God components (ReportEditForm, VoiceNoteCard, FileCard) → split dialogs; reduce boolean useState repetition; split overloaded providers.
3. **Opportunity for shorter rewrite**: Extract common dialog patterns, consolidate repeated row components, use dialog state machine hook instead of 5 booleans, move report editing logic closer to form component.
4. **Key architectural success**: Pure reducer for upload jobs (deterministic, testable); context + useState hybrid for state mgmt (minimal, clear); immutable report helpers (safe, testable).
5. **Key risk in rewrite**: testID naming convention has no registry (Maestro flows hard-code IDs); renaming requires manual search in all `.maestro/*.yaml` files.

---

**Created**: May 10, 2026  
**Line count**: ~600  
**Scope**: Complete inventory of apps/mobile/ suitable for from-scratch rewrite without reopening original source.

---

