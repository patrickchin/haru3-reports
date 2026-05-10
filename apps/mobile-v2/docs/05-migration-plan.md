# v2 Migration Plan & Task List

> **Scope**: Rewrite `apps/mobile/` → `apps/mobile-v2/` as a from-scratch Expo app  
> **Baseline**: v1 = ~22,500 LOC · 23 routes · 79 unit tests · 47 Maestro flows  
> **LOC target**: ≤ 16,000 non-test LOC (−29 %) by splitting god components + removing dead deps  
> **Branch strategy**: all work lands on `dev` via PR; v2 never touches `apps/mobile/`

---

## Part A — Phased Migration Plan

### Phase 0: Scaffold

| | |
|---|---|
| **Goal** | Empty Expo app boots to a blank screen via `pnpm ios:v2` with all foundational deps wired. |
| **Scope** | `apps/mobile-v2/` with expo-router, NativeWind 4, React Query 5, Supabase client singleton, Zod, `eas.json` (dev-only profile), `app.json` (temporary slug `harpa-pro-v2`), Vitest config, `@/` path alias, design tokens copied verbatim. |
| **Out of scope** | Auth, any real screens, Maestro, production EAS profiles. |
| **Exit criteria** | `pnpm ios:v2` renders a NativeWind-styled "Hello v2" screen · `pnpm test:mobile-v2` runs 0 tests with exit 0 · EAS `development` build succeeds on iOS simulator. |
| **Risk + mitigation** | NativeWind 4 + Expo SDK 55 config conflicts → pin exact versions from v1 `package.json`; validate with a cold `npx expo prebuild` before merging. |

---

### Phase 1: Auth + Onboarding + Projects

| | |
|---|---|
| **Goal** | User can sign in, complete onboarding, view project list, and create a project — all RLS-respecting. |
| **Scope** | Routes: `/`, `/signup`, `/onboarding`, `/(tabs)/projects`, `/projects/new`, `/e2e/login`. Lib: `auth.tsx`, `auth-security.ts`, `uuid.ts`, `remembered-login.ts`, `dev-flags.ts`. Hooks: `useLocalProjects`. Components: `ProjectCard`, `AppDialogSheet`. RLS queries verified by existing `supabase/tests/rls_*.test.ts`. |
| **Out of scope** | Project edit, members, reports, uploads, voice notes. |
| **Exit criteria** | Maestro subflow `auth-and-onboarding` passes against v2 build · unit tests for `auth-security`, `uuid`, `remembered-login`, `phone` pass · demo deep-link `harpa://e2e/login?demo=0` works. |
| **Risk + mitigation** | Hermes crypto quirk on release build → port `uuid.ts` with `expo-crypto` first + RFC 4122 fallback verbatim · test on release build before merging. |

---

### Phase 2: Reports — Draft + Edit + Finalize

| | |
|---|---|
| **Goal** | User can create a draft report, edit all 7 sections, finalize, view finalized reports, and soft-delete drafts. |
| **Scope** | Routes: `/projects/[projectId]/reports/index`, `generate`, `[reportId]`. Lib: `report-edit-helpers.ts`, `generated-report.ts`, `draft-report-actions.ts`, `report-to-html.ts`. Hooks: `useLocalReports`, `useReportAutoSave`, `useReportGeneration`. Components: `ReportEditForm` (split into `SectionEditor`, `RoleRow`, `MaterialRow`), `EditTabPane`, `DeleteDraftButton`, `GenerateReportProvider` (split state/mutations). Notes timeline (text-only placeholder). |
| **Out of scope** | Voice notes in timeline, file attachments in timeline, PDF export, members. |
| **Exit criteria** | Maestro `new-report-fixture-happy` passes · `ReportEditForm` < 300 LOC (down from ~800) · unit tests for `report-edit-helpers`, `draft-report-actions`, `generated-report` pass · `useReportAutoSave` test passes. |
| **Risk + mitigation** | God-component split may change testIDs → grep `.maestro/*.yaml` before renaming; preserve all existing testID strings. |

---

### Phase 3: File Uploads + Photos

| | |
|---|---|
| **Goal** | User can attach photos & documents to a report; upload queue processes, persists, and resumes after relaunch; notes timeline shows file cards. |
| **Scope** | Upload queue: `queue.ts`, `jobs.ts`, `uploader.ts`, `blob.ts`, `preprocess-step.ts`, `ios-background-upload.ts`, `android-foreground-service.ts`, `prewarm.ts`. Hooks: `useUploadQueue`, `useProjectFiles`. Components: `FileCard` (split dialogs out), `FilePickerButton`, `UploadTrayBadge`, `CachedImage`. Camera: `/(camera)/capture`. |
| **Out of scope** | Voice notes, avatar upload, PDF export. |
| **Exit criteria** | Maestro `photo-upload-completes`, `photo-upload-burst-completes`, `queue-persists-after-relaunch`, `photo-library-pick-completes` pass · unit tests for `queue`, `jobs`, `uploader`, `blob`, `preprocess-step` pass · `FileCard` < 250 LOC (down from ~480). |
| **Risk + mitigation** | Native dep `expo-camera` + `expo-file-system` background session require full EAS dev-client rebuild → schedule rebuild at phase start; validate on physical device before merging. |

---

### Phase 4: Voice Notes

| | |
|---|---|
| **Goal** | User can record a voice note, transcribe via edge function, auto-summarize, play back with audio ducking; fixture mode works for E2E. |
| **Scope** | Lib: `voice-note-flow.ts`, `voice-note-cache.ts`, `voice-note-share.ts`, `AudioPlaybackProvider.tsx`. Hooks: `useSpeechToText`, `useSummarizeVoiceNote`, `useVoiceNotePlayer`. Components: `VoiceNoteCard` (split into card + `VoiceNoteDeleteDialog`, `VoiceNoteOptionsDialog`, `VoiceNoteTranscriptDialog`), `VoiceNoteList`. Dev flags for `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE`. |
| **Out of scope** | Members, account, usage, PDF. |
| **Exit criteria** | Maestro `record-replay-delete`, `playback-coordination`, `cached-playback` pass · `VoiceNoteCard` < 200 LOC (down from ~550) · unit tests for `AudioPlaybackProvider`, `voice-note-flow`, `voice-note-cache`, `useSpeechToText`, `useSummarizeVoiceNote` pass. |
| **Risk + mitigation** | `expo-audio` version mismatch may break ducking → lock to same version as v1 · audio ducking only testable on device → manual smoke required. |

---

### Phase 5: Members, Account, Usage, PDF Export

| | |
|---|---|
| **Goal** | All remaining screens reach feature parity: project members, profile/account, usage dashboard, PDF export. |
| **Scope** | Routes: `/projects/[projectId]/members`, `/projects/[projectId]/edit`, `/profile`, `/account` (if separate), `/usage`. Hooks: `useProjectMembers` (if exists). Components: `AvatarUploader`, member list, usage table. Lib: `export-report-pdf.ts`, `project-members.ts`. Avatar upload via `avatars` bucket. |
| **Out of scope** | Maestro parity, performance tuning. |
| **Exit criteria** | Maestro `profile-settings`, `cross-user-rls`, `usage-populated` pass · PDF export produces valid file on iOS & Android · avatar upload + crop works · unit tests for `export-report-pdf`, `project-members` pass. |
| **Risk + mitigation** | `react-native-pdf` native dep → verify v2 Expo config plugin compatibility before starting; fallback to WebView-based PDF viewer if blocked. |

---

### Phase 6: Maestro Parity + Performance Pass

| | |
|---|---|
| **Goal** | All 47 Maestro flows pass against v2; cold-start and screen-transition performance match or beat v1. |
| **Scope** | Port all `.maestro/` flows (update `appId` to v2 bundle ID). Add missing testIDs discovered during porting. Remove `react-native-webview` and `react-native-blob-util` if confirmed dead. Tree-shake unused `lucide` icons. Profile cold-start with Flipper/Hermes profiler. |
| **Out of scope** | App Store metadata, cutover. |
| **Exit criteria** | `maestro test .maestro/` — 47/47 green on iOS simulator · cold-start ≤ v1 baseline (measure 3 runs, take median) · no new R-patterns introduced · `pnpm test:mobile-v2` coverage ≥ 80 %. |
| **Risk + mitigation** | Maestro flow failures from testID drift → maintain a testID diff log during Phases 1–5; reconcile at start of Phase 6. |

---

### Phase 7: Cutover

| | |
|---|---|
| **Goal** | `apps/mobile-v2/` becomes the canonical `apps/mobile/`; CI, EAS, and OTA pipelines point to it. |
| **Scope** | Rename dirs, update `app.json` slug back to `harpa-pro`, update EAS channels, update CI workflow paths, update root `package.json` scripts, update `AGENTS.md` references. |
| **Out of scope** | New features. |
| **Exit criteria** | `pnpm ios` builds v2 · `pnpm test:mobile` runs v2 tests · CI green on `dev` · EAS `preview` build installs on TestFlight · Maestro nightly succeeds against preview build. |
| **Risk + mitigation** | OTA channel mismatch → test channel binding on internal build before removing legacy · keep `apps/mobile-legacy/` for 2 weeks before deleting. |

---

## Part B — Task List

### Phase 0: Scaffold

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 0.1 | Init Expo project in `apps/mobile-v2/` | `app.json`, `package.json`, `tsconfig.json`, `babel.config.js` | architect | M | — |
| 0.2 | Configure expo-router with `app/_layout.tsx` + index route | `app/_layout.tsx`, `app/index.tsx` | tdd-guide | S | 0.1 |
| 0.3 | Wire NativeWind + `tailwind.config.ts` + `global.css` | `tailwind.config.ts`, `global.css`, `babel.config.js`, `metro.config.js` | build-error-resolver | S | 0.1 |
| 0.4 | Copy design tokens from v1 | `lib/design-tokens/colors.ts` | code-reviewer | S | 0.3 |
| 0.5 | Add Supabase client singleton + env vars | `lib/supabase.ts`, `.env.example` | security-reviewer | S | 0.1 |
| 0.6 | Add React Query provider | `lib/query-client.ts`, `app/_layout.tsx` | tdd-guide | S | 0.2 |
| 0.7 | Add Vitest config + first smoke test | `vitest.config.ts`, `lib/__tests__/smoke.test.ts` | tdd-guide | S | 0.1 |
| 0.8 | Add `eas.json` (development profile only) | `eas.json` | architect | S | 0.1 |
| 0.9 | Add root script `pnpm ios:v2` | root `package.json` | doc-updater | S | 0.1 |
| 0.10 | Add `@/` path alias | `tsconfig.json`, `babel.config.js` | build-error-resolver | S | 0.1 |
| 0.11 | EAS dev build → iOS simulator boot | — (CI/manual) | build-error-resolver | M | 0.1–0.10 |

### Phase 1: Auth + Onboarding + Projects

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 1.1 | Port `lib/uuid.ts` + `lib/uuid.test.ts` | `lib/uuid.ts`, `lib/uuid.test.ts` | tdd-guide | S | 0.11 |
| 1.2 | Port `lib/auth.tsx`, `lib/auth-security.ts`, session provider | `lib/auth.tsx`, `lib/auth-security.ts`, `lib/auth-security.test.ts` | security-reviewer | M | 0.5, 1.1 |
| 1.3 | Port `lib/remembered-login.ts` + tests | `lib/remembered-login.ts`, `lib/remembered-login.test.ts` | tdd-guide | S | 1.2 |
| 1.4 | Port `lib/phone.ts` + `lib/login-phone-hint.ts` + tests | `lib/phone.ts`, `lib/phone.test.ts`, `lib/login-phone-hint.ts` | tdd-guide | S | — |
| 1.5 | Build signup + login screens | `app/signup.tsx`, `app/_layout.tsx` | code-reviewer | M | 1.2, 1.4 |
| 1.6 | Build onboarding screen | `app/onboarding.tsx` | code-reviewer | M | 1.2 |
| 1.7 | Port `lib/dev-flags.ts` + `app/e2e/login.tsx` | `lib/dev-flags.ts`, `lib/dev-flags.test.ts`, `app/e2e/login.tsx` | tdd-guide | S | 1.2 |
| 1.8 | Build `AppDialogSheet` component | `components/ui/AppDialogSheet.tsx` | code-reviewer | M | 0.3 |
| 1.9 | Port `hooks/useLocalProjects.ts` + tests | `hooks/useLocalProjects.ts`, `hooks/useLocalProjects.test.tsx` | tdd-guide | M | 0.6 |
| 1.10 | Build projects list screen + `ProjectCard` | `app/(tabs)/projects.tsx`, `app/(tabs)/_layout.tsx`, `components/projects/ProjectCard.tsx` | code-reviewer | M | 1.9 |
| 1.11 | Build project create screen | `app/projects/new.tsx` | code-reviewer | S | 1.9 |
| 1.12 | Root index redirect (auth guard) | `app/index.tsx` | code-reviewer | S | 1.2, 1.10 |
| 1.13 | Maestro: port `auth-and-onboarding` + subflows | `.maestro/subflows/*.yaml`, `.maestro/journeys/auth-and-onboarding.yaml` | e2e-runner | M | 1.5–1.12 |
| 1.14 | Add `+not-found.tsx` + `ErrorBoundary` in `_layout` | `app/+not-found.tsx`, `app/_layout.tsx` | code-reviewer | S | 0.2 |

### Phase 2: Reports — Draft + Edit + Finalize

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 2.1 | Port `lib/report-edit-helpers.ts` + tests | `lib/report-edit-helpers.ts`, `lib/report-edit-helpers.test.ts` | tdd-guide | M | 0.11 |
| 2.2 | Port `lib/generated-report.ts` + tests | `lib/generated-report.ts`, `lib/generated-report.test.ts` | tdd-guide | M | — |
| 2.3 | Port `lib/draft-report-actions.ts` + tests | `lib/draft-report-actions.ts`, `lib/draft-report-actions.test.ts` | tdd-guide | M | 2.1 |
| 2.4 | Port `hooks/useLocalReports.ts` + tests | `hooks/useLocalReports.ts`, `hooks/useLocalReports.test.tsx` | tdd-guide | M | 0.6 |
| 2.5 | Port `hooks/useReportAutoSave.ts` + tests | `hooks/useReportAutoSave.ts`, `hooks/useReportAutoSave.test.tsx` | tdd-guide | M | 2.4 |
| 2.6 | Build `SectionEditor`, `RoleRow`, `MaterialRow` (split from god component) | `components/reports/SectionEditor.tsx`, `components/reports/RoleRow.tsx`, `components/reports/MaterialRow.tsx` | code-reviewer | L | 2.1 |
| 2.7 | Build `ReportEditForm` (thin orchestrator, < 300 LOC) | `components/reports/ReportEditForm.tsx`, `components/reports/__tests__/ReportEditForm.test.tsx` | tdd-guide | L | 2.6 |
| 2.8 | Split `GenerateReportProvider` → state ctx + mutations ctx | `lib/generate-report-state.tsx`, `lib/generate-report-mutations.tsx` | architect | M | 2.4 |
| 2.9 | Port `hooks/useReportGeneration.ts` + tests | `hooks/useReportGeneration.ts`, `hooks/useReportGeneration.test.tsx`, `hooks/useReportGeneration.errors.test.tsx` | tdd-guide | M | 2.8 |
| 2.10 | Build report screens: index, generate, `[reportId]` | `app/projects/[projectId]/reports/index.tsx`, `generate.tsx`, `[reportId].tsx`, `_layout.tsx` | code-reviewer | L | 2.7, 2.9 |
| 2.11 | Build `EditTabPane` + `DeleteDraftButton` | `components/reports/EditTabPane.tsx`, `components/reports/DeleteDraftButton.tsx`, `components/reports/DeleteDraftButton.test.tsx` | tdd-guide | M | 2.7 |
| 2.12 | Port `lib/report-to-html.ts` + tests | `lib/report-to-html.ts`, `lib/report-to-html.test.ts` | tdd-guide | S | — |
| 2.13 | Text-only note timeline placeholder | `components/notes/NoteTimeline.tsx`, `hooks/useLocalReportNotes.ts` | code-reviewer | M | 2.10 |
| 2.14 | Maestro: port `new-report-fixture-happy`, `new-report-empty-note` | `.maestro/reports/*.yaml` | e2e-runner | M | 2.10–2.13 |

### Phase 3: File Uploads + Photos

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 3.1 | Port `lib/uploads/jobs.ts` + tests (pure reducer) | `lib/uploads/jobs.ts`, `lib/uploads/jobs.test.ts` | tdd-guide | M | — |
| 3.2 | Port `lib/uploads/queue.ts` + tests | `lib/uploads/queue.ts`, `lib/uploads/queue.test.ts` | tdd-guide | L | 3.1 |
| 3.3 | Port `lib/uploads/blob.ts` + `preprocess-step.ts` + tests | `lib/uploads/blob.ts`, `lib/uploads/blob.test.ts`, `lib/uploads/preprocess-step.ts`, `lib/uploads/preprocess-step.test.ts` | tdd-guide | M | — |
| 3.4 | Port `lib/uploads/uploader.ts` + tests | `lib/uploads/uploader.ts`, `lib/uploads/uploader.test.ts` | tdd-guide | M | 3.1–3.3 |
| 3.5 | Port iOS background upload + Android foreground service | `lib/uploads/ios-background-upload.ts`, `lib/uploads/android-foreground-service.ts` + tests | tdd-guide | M | 3.4 |
| 3.6 | Port `lib/uploads/prewarm.ts` + tests | `lib/uploads/prewarm.ts`, `lib/uploads/prewarm.test.ts` | tdd-guide | S | 3.2 |
| 3.7 | Port `hooks/useUploadQueue.ts` + `hooks/useProjectFiles.ts` + tests | `hooks/useUploadQueue.ts`, `hooks/useProjectFiles.ts` + tests | tdd-guide | M | 3.2, 3.4 |
| 3.8 | Port `lib/preprocess-image.ts`, `lib/image-cache.ts`, `lib/image-telemetry.ts` + tests | lib files + tests | tdd-guide | M | — |
| 3.9 | Build `FileCard` (card only) + `FileDeleteDialog`, `FileOptionsDialog` | `components/files/FileCard.tsx`, `components/files/FileDeleteDialog.tsx`, `components/files/FileCard.test.tsx` | tdd-guide | M | 3.7 |
| 3.10 | Build `FilePickerButton` + `UploadTrayBadge` + `CachedImage` + tests | component files + tests | tdd-guide | M | 3.7 |
| 3.11 | Build camera capture screen | `app/(camera)/capture.tsx`, `app/(camera)/_layout.tsx`, `lib/camera-session-registry.ts` + test | code-reviewer | M | 3.7 |
| 3.12 | Wire file cards into notes timeline | `components/notes/NoteTimeline.tsx`, `hooks/useLocalReportNotes.ts` + test update | code-reviewer | M | 2.13, 3.9 |
| 3.13 | Port `hooks/useImagePreviewProps.ts` + image lightbox | hook + test + component | tdd-guide | S | 3.8 |
| 3.14 | EAS dev-client rebuild (native deps) | — (CI/manual) | build-error-resolver | M | 3.5, 3.11 |
| 3.15 | Maestro: port file upload flows (6 flows) | `.maestro/files/*.yaml` | e2e-runner | M | 3.14 |

### Phase 4: Voice Notes

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 4.1 | Port `lib/voice-note-flow.ts` + tests | `lib/voice-note-flow.ts`, `lib/voice-note-flow.test.ts` | tdd-guide | M | — |
| 4.2 | Port `lib/voice-note-cache.ts` + `lib/voice-note-share.ts` + tests | lib files + tests | tdd-guide | S | — |
| 4.3 | Port `lib/audio/AudioPlaybackProvider.tsx` + tests | `lib/audio/AudioPlaybackProvider.tsx`, test | tdd-guide | L | 0.6 |
| 4.4 | Port `hooks/useSpeechToText.ts` + tests | hook + test | tdd-guide | M | 4.1 |
| 4.5 | Port `hooks/useSummarizeVoiceNote.ts` + tests | hook + test | tdd-guide | M | 4.1 |
| 4.6 | Port `hooks/useVoiceNotePlayer.ts` + tests | hook + test | tdd-guide | M | 4.3 |
| 4.7 | Build `VoiceNoteCard` (< 200 LOC) + extracted dialogs | `components/voice-notes/VoiceNoteCard.tsx`, `VoiceNoteDeleteDialog.tsx`, `VoiceNoteOptionsDialog.tsx`, `VoiceNoteTranscriptDialog.tsx`, tests | tdd-guide | L | 4.6 |
| 4.8 | Build `VoiceNoteList` + tests | `components/voice-notes/VoiceNoteList.tsx`, test | tdd-guide | S | 4.7 |
| 4.9 | Wire voice note cards into notes timeline | `components/notes/NoteTimeline.tsx`, `hooks/useNoteTimeline.ts` + test | code-reviewer | M | 4.7, 2.13 |
| 4.10 | Port `lib/transcribe.ts` + tests | `lib/transcribe.ts`, test | tdd-guide | S | — |
| 4.11 | Maestro: port voice-note flows (6 flows) | `.maestro/voice-notes/*.yaml` | e2e-runner | M | 4.7–4.9 |
| 4.12 | Manual smoke: audio ducking on physical device | — | — | S | 4.3 |

### Phase 5: Members, Account, Usage, PDF

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 5.1 | Port `lib/project-members.ts` + tests | lib + test | tdd-guide | S | — |
| 5.2 | Build members screen | `app/projects/[projectId]/members.tsx` | code-reviewer | M | 5.1 |
| 5.3 | Build project edit screen | `app/projects/[projectId]/edit.tsx` | code-reviewer | M | 1.9 |
| 5.4 | Build profile screen + `AvatarUploader` + tests | `app/profile.tsx`, `components/account/AvatarUploader.tsx`, test | tdd-guide | M | 3.7 |
| 5.5 | Build usage screen | `app/usage.tsx` | code-reviewer | M | 0.6 |
| 5.6 | Port `lib/export-report-pdf.ts` + tests | lib + test | tdd-guide | M | 2.12 |
| 5.7 | Wire PDF export into report detail screen | `app/projects/[projectId]/reports/[reportId].tsx` | code-reviewer | M | 5.6 |
| 5.8 | Port remaining utility libs + tests | `lib/format-date.ts`, `lib/utils.ts`, `lib/surface-depth.ts`, `lib/build-info.ts`, `lib/mobile-ui.ts`, `lib/note-entry.ts`, `lib/app-dialog-copy.ts`, `lib/generate-report-ui.ts`, `lib/project-overview.ts`, `lib/project-reports-list.ts` + tests | tdd-guide | M | — |
| 5.9 | Port `hooks/useRefresh.ts`, `hooks/useCopyToClipboard.ts` + tests | hooks + tests | tdd-guide | S | — |
| 5.10 | Maestro: `profile-settings`, `cross-user-rls`, `usage-populated`, `avatar-upload-cancel` | `.maestro/profile/*.yaml`, `.maestro/journeys/*.yaml` | e2e-runner | M | 5.2–5.5 |
| 5.11 | Maestro: report detail flows (`save-pdf`, `pdf-in-app-view`, remaining report flows) | `.maestro/reports/*.yaml` | e2e-runner | M | 5.7 |

### Phase 6: Maestro Parity + Performance

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 6.1 | Audit: diff all 47 Maestro flows against v2 testIDs | `.maestro/**/*.yaml` | e2e-runner | M | 5.11 |
| 6.2 | Fix failing Maestro flows (testID reconciliation) | various component files | e2e-runner | M | 6.1 |
| 6.3 | Port `core-end-to-end` journey | `.maestro/journeys/core-end-to-end.yaml` | e2e-runner | M | 6.2 |
| 6.4 | Port camera Maestro flows | `.maestro/camera/*.yaml` | e2e-runner | S | 6.2 |
| 6.5 | Remove dead deps (`react-native-webview`, `react-native-blob-util`, unused reanimated) | `package.json` | code-reviewer | S | 6.2 |
| 6.6 | Tree-shake unused Lucide icons (import audit) | `package.json`, component imports | code-reviewer | S | 6.2 |
| 6.7 | Cold-start profiling: Hermes bundle analysis | — (Flipper / `react-native-performance`) | architect | M | 6.5 |
| 6.8 | Port `__tests-config__/` tests (permissions, press coverage) | `__tests-config__/*.test.ts` | tdd-guide | S | 6.2 |
| 6.9 | Port remaining `__tests__/` screen tests | `__tests__/*.test.tsx` | tdd-guide | M | 6.2 |
| 6.10 | Coverage gate: verify ≥ 80 % | `vitest.config.ts` (coverage threshold) | tdd-guide | S | 6.9 |
| 6.11 | Port `lib/file-validation.ts`, `lib/image-share.ts`, `lib/test-fixtures.ts` + tests | lib + tests | tdd-guide | S | — |

### Phase 7: Cutover

| # | Task | Files touched | Subagent | Size | Depends on |
|---|------|---------------|----------|------|------------|
| 7.1 | Pre-cutover checklist sign-off (see Part D) | — (manual) | — | S | 6.10 |
| 7.2 | Rename `apps/mobile` → `apps/mobile-legacy` | root `package.json`, `pnpm-workspace.yaml` | architect | M | 7.1 |
| 7.3 | Rename `apps/mobile-v2` → `apps/mobile` | `app.json` (slug → `harpa-pro`), `eas.json`, root scripts | architect | M | 7.2 |
| 7.4 | Update CI workflow path filters (`apps/mobile/**`) | `.github/workflows/mobile-tests.yml`, `eas-update.yml`, `maestro-smoke.yml` | doc-updater | M | 7.3 |
| 7.5 | Update EAS channels + OTA branch bindings | `eas.json`, EAS dashboard | architect | M | 7.3 |
| 7.6 | Update `AGENTS.md`, `docs/*.md` references | `AGENTS.md`, `docs/02-deployment.md`, `docs/09-testing.md` | doc-updater | M | 7.3 |
| 7.7 | EAS preview build + TestFlight install + manual smoke | — | build-error-resolver | M | 7.5 |
| 7.8 | Maestro nightly against preview build — 47/47 green | — | e2e-runner | M | 7.7 |
| 7.9 | Delete `apps/mobile-legacy/` (after 2-week hold) | `apps/mobile-legacy/` | — | S | 7.8 |

---

## Part C — Cross-Cutting Tasks (Continuous)

| Task | Trigger | Subagent |
|------|---------|----------|
| Code review every PR | Every PR before merge | code-reviewer |
| Security review on auth/RLS/input PRs | PR touches `auth*`, `rls*`, user input handling, `security*` | security-reviewer |
| RLS test coverage for new data paths | PR adds/changes Supabase table access or RPC | database-reviewer |
| Doc updates same-PR-as-code | Any behavioural, schema, or deployment change | doc-updater |
| Memory-file updates for new R-patterns | Bug recurs or almost recurs | doc-updater |
| Bug-log entries per `AGENTS.md` | Recurring bug fixed or caught late | doc-updater |
| testID drift log | Any component rename or testID change | e2e-runner |
| `no-direct-crypto` lint test ported early (Phase 1) | — | tdd-guide |

---

## Part D — Cutover & Rollback

### Pre-Cutover Checklist

- [ ] All 47 Maestro flows pass on v2 preview build (iOS + Android)
- [ ] `supabase/tests/rls_*.test.ts` suite green (no v2-specific RLS changes expected, but confirm)
- [ ] EAS internal-test (`preview`) build installed on 2+ physical devices
- [ ] Manual smoke: login → create project → draft report → add voice note → attach photo → finalize → PDF export → delete draft → logout
- [ ] `pnpm test:mobile-v2` — 0 failures, ≥ 80 % coverage
- [ ] Cold-start time ≤ v1 median (measured on iPhone 14 / Pixel 7)
- [ ] No new R-patterns in `docs/bugs/README.md` attributed to v2
- [ ] v1 `apps/mobile/` untouched throughout migration (diff check)

### Cutover Steps

1. Freeze `apps/mobile/` — no new PRs targeting v1.
2. `git mv apps/mobile apps/mobile-legacy`
3. `git mv apps/mobile-v2 apps/mobile`
4. Update `apps/mobile/app.json`: `"slug": "harpa-pro"`, restore production bundle ID `com.harpa.pro`.
5. Update `apps/mobile/eas.json`: add `preview` + `production` profiles (copied from v1 with same channel names).
6. Update `pnpm-workspace.yaml` — remove `mobile-legacy`, keep `mobile`.
7. Update root `package.json` scripts: `ios`, `ios:mock`, `ios:mock:release`, `test:mobile`.
8. Update `.github/workflows/`: `mobile-tests.yml`, `eas-update.yml`, `maestro-smoke.yml` path filters.
9. `eas update --branch preview --message "v2 cutover"` — push OTA to preview channel.
10. EAS production build (`eas build --profile production --platform all`).
11. Verify Maestro nightly triggers and passes.
12. Submit to App Store / Play Store via `eas submit`.

### Rollback Steps

If critical issue found post-cutover:

1. `git mv apps/mobile apps/mobile-v2`
2. `git mv apps/mobile-legacy apps/mobile`
3. Revert `app.json`, `eas.json`, root scripts, CI workflows (single revert commit).
4. `eas update --branch preview --message "rollback to v1"` — OTA pushes v1 JS bundle.
5. If native-layer issue: `eas build --profile production` from restored `apps/mobile/`.
6. Push revert commit to `dev`.

---

## Part E — Definition of Done for v2

1. **LOC reduction**: ≤ 16,000 non-test LOC (v1 = ~22,500; target −29 % from splitting god components, removing dead deps, eliminating boolean-dialog-state bloat).
2. **Feature parity**: All 10 feature areas from inventory §3 functional (auth, projects, reports, notes, voice notes, uploads, camera, members, account/profile, usage/PDF).
3. **Route parity**: All 23 routes present and navigable.
4. **Unit test coverage**: ≥ 80 % line coverage (`vitest --coverage`).
5. **Unit test count**: ≥ 79 test files (matching v1).
6. **Maestro parity**: 47/47 flows green on iOS simulator + Android emulator.
7. **Performance parity**: cold-start ≤ v1 median; screen transitions ≤ 16 ms frame budget (no jank).
8. **No god components**: no file > 400 LOC (v1 had 4 files > 400).
9. **No new R-patterns**: zero new entries in `docs/bugs/README.md` caused by v2.
10. **Dead deps removed**: `react-native-webview` gone; `react-native-blob-util` gone unless justified.
11. **ErrorBoundary**: present in root `_layout.tsx` (missing in v1).
12. **Security**: `no-direct-crypto` lint test passes; no service-role key in client bundle; all inputs validated with Zod at system boundaries.
13. **CI green**: `mobile-tests.yml`, `eas-update.yml`, `maestro-smoke.yml` all pass on `dev`.
14. **Docs current**: `AGENTS.md`, `docs/02-deployment.md`, `docs/09-testing.md` updated to reflect v2 paths.