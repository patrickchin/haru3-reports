# Mobile-v2 Morning Briefing — Code Review

**Scope:** ~120 files, ~10k LOC across `apps/mobile-v2/src/` and `apps/mobile-v2/app/`. Design docs (8 files), Phase 0 scaffold, four feature waves, voice notes wave, typecheck-fix pass. Tests omitted (TDD agent running in parallel).

---

## A. Design-Principles Compliance Check

### ✅ **PASS: No callback injection (cardinal sin avoided)**

- Fixture mode uses inline `if (env.EXPO_PUBLIC_USE_FIXTURES)` branches per design doc §4
- [transcribe.ts:33](apps/mobile-v2/src/features/voice-notes/transcribe.ts#L33), [summarize.ts:32](apps/mobile-v2/src/features/voice-notes/summarize.ts#L32) — correct pattern
- No `updateFileMetadataFn`, `transcribeFn`, or similar injection found

### ✅ **PASS: Data fetched locally (not prop-drilled)**

- [note-timeline.tsx:18](apps/mobile-v2/src/features/reports/components/note-timeline.tsx#L18) calls `useReportNotes(reportId)` inside the component
- [projects/[projectId]/index.tsx:22-23](apps/mobile-v2/app/projects/[projectId]/index.tsx#L22-L23) calls `useProject`, `useProjectMembers` at screen level
- No multi-level prop drilling observed

### ✅ **PASS: Shared primitives actually reused**

- `Button` imported in 11 files across features
- `Sheet` imported in 6 files (with compound `Sheet.Title`/`Sheet.Body`/`Sheet.Actions` pattern)
- `Card` imported in 7 files
- No feature-local duplicates found

### ✅ **PASS: testID registry used consistently**

- Zero hardcoded `testID="string"` literals found (grep returned no matches)
- All testIDs sourced from [infra/test-ids.ts](apps/mobile-v2/src/infra/test-ids.ts)
- Functions like `testIds.voiceNotes.card(fileId)` correctly used

### ⚠️ **MEDIUM: report-edit-form.tsx at ~290 LOC but coherent**

- [report-edit-form.tsx](apps/mobile-v2/src/features/reports/components/report-edit-form.tsx) renders 4 sections (meta, weather, workers, materials, issues) in one scroll
- Design doc §1 allows >250 LOC when "reads top-to-bottom and tells one coherent story"
- **Verdict:** Acceptable per doc, but watch for further growth

### ✅ **PASS: No optimistic updates outside allowed flows**

- Zero `setQueriesData` found (grep returned no matches)
- Mutations follow `await → invalidate` pattern per design doc §6
- Voice pipeline has TODO for optimistic merge (not yet implemented)

### ⚠️ **MEDIUM: Type sprawl — db-types.ts needs generation**

- [infra/db-types.ts:4](apps/mobile-v2/src/infra/db-types.ts#L4) has TODO to run `supabase gen types typescript`
- Manual type definitions present (Profile, Project, SiteReport, etc.)
- **Risk:** Schema drift if migrations land without updating types
- Only one `type Project =` declaration found (no redeclarations elsewhere) ✅

### ✅ **PASS: No phased-migration leftovers**

- No "v2-only" markers, compatibility shims, or legacy-preservation code
- Clean slate rewrite per design doc §7

---

## B. R-Pattern Recurrence Check

Checking [docs/bugs/README.md](../../docs/bugs/README.md) R1–R11 patterns against new code:

### ✅ **R1 (Fixture stubs hiding failures): PREVENTED**

- Fixture stubs are inline and **only mock LLM calls**, not DB writes
- [transcribe.ts:33-36](apps/mobile-v2/src/features/voice-notes/transcribe.ts#L33-L36), [summarize.ts:32-35](apps/mobile-v2/src/features/voice-notes/summarize.ts#L32-L35) return mocked data but don't bypass side effects

### ✅ **R2 (`optional: true` silencing assertions): N/A**

- No Maestro flows in `mobile-v2/` yet (design docs only)

### ⚠️ **R3 (Mutation without optimistic update): PARTIAL RISK**

- Voice pipeline [use-voice-pipeline.ts:85-93](apps/mobile-v2/src/features/voice-notes/use-voice-pipeline.ts#L85-L93) writes transcript/summary to DB but **does NOT optimistically merge into cache**
- Design doc §6 says "no optimistic updates by default" but the 2026-05-08 bug fix mandated optimistic merge for voice summary
- **Status:** Bug will recur if user sees stale data after summarize completes

### ✅ **R4 (Mocked tests crossing I/O boundaries): N/A**

- Tests not in scope for this review (TDD agent running)

### ✅ **R5 (Threshold-gated UI hidden in fixtures): N/A**

- Fixture payloads not yet defined (only canned strings in transcribe/summarize)

### ✅ **R6–R9 (Maestro drift, fixture tagging, cleanup nav, timeouts): N/A**

- No Maestro flows in mobile-v2 yet

### ⚠️ **R10 (Incomplete RLS coverage): UNKNOWN**

- No RLS test files in `mobile-v2/` (they live in `supabase/tests/`)
- **Can't verify** if new mutations (projects, reports, notes) have full RLS matrix coverage

### ⚠️ **R11 (Optimistic-row swap unmount): WATCH**

- Upload queue has placeholder row logic in [jobs.ts:116-124](apps/mobile-v2/src/features/uploads/jobs.ts#L116-L124) (`placeholderFileId`, `placeholderStoragePath`)
- **No visual bridging found** (no stable key, no capture-time sort in timeline components)
- Voice pipeline TODO mentions optimistic merge but not row swap
- **Risk:** Photo upload completion will flicker (unmount + remount) when real row appears

---

## C. Architecture Observations

### ✅ **Shared primitives are well-adopted**

- `Sheet`, `Button`, `Card`, `TextField`, `Screen`, `EmptyState`, `LoadingDots` all used across 6–11 files
- Compound pattern (`Sheet.Title`, `Sheet.Body`, `Sheet.Actions`) correctly implemented

### ✅ **testID registry is actually referenced**

- [infra/test-ids.ts](apps/mobile-v2/src/infra/test-ids.ts) exports ~50 testID functions
- Zero hardcoded strings found
- Maestro flows will be able to reference centralized catalog

### ✅ **Mutations follow server-as-truth pattern**

- [reports/mutations.ts](apps/mobile-v2/src/features/reports/mutations.ts), [projects/mutations.ts](apps/mobile-v2/src/features/projects/mutations.ts) all use `onSuccess: () => queryClient.invalidateQueries(...)`
- No optimistic merges (per design doc §6)
- **Exception needed:** Voice pipeline optimistic merge (R3 recurrence risk)

### ⚠️ **Upload queue ported correctly but incomplete**

- Pure reducer in [jobs.ts](apps/mobile-v2/src/features/uploads/jobs.ts) ✅
- Single-flight worker in [queue.ts](apps/mobile-v2/src/features/uploads/queue.ts) ✅
- AsyncStorage snapshot ✅
- Placeholder row tracked (`placeholderFileId`) ✅
- **Missing:** R11 bridging — no stable key propagated to timeline components
- **Missing:** UI components for pending photo/document rows (only text notes exist in Phase 0)

### ⚠️ **expo-av → expo-audio migration stubbed, not done**

- [recorder.ts:5](apps/mobile-v2/src/features/voice-notes/recorder.ts#L5), [audio-playback-provider.tsx:22](apps/mobile-v2/src/features/audio/audio-playback-provider.tsx#L22) have `TODO(audio-port)` stubs
- Temporary stub classes return empty strings, no-op async
- **Blocker:** Voice recording/playback will not work until ported

### ✅ **No Alert.alert usage**

- Zero `Alert.alert` found (design doc mandate respected)

### 🔴 **CRITICAL: Math.random for storage paths**

- [uploader.ts:228](apps/mobile-v2/src/features/uploads/uploader.ts#L228), [uploader.ts:249](apps/mobile-v2/src/features/uploads/uploader.ts#L249) use `Math.random().toString(36).slice(2, 10)` for storage file names
- Not security IDs, but [01-lessons-learned.md §3](apps/mobile-v2/docs/01-lessons-learned.md#L3) forbids `Math.random()` for **any** ID-like artifact
- **Fix:** Use `newId().slice(0, 8)` or similar UUID-derived suffix

---

## D. Top 10 Highest-Leverage Cleanups

1. **[use-voice-pipeline.ts:85-93](apps/mobile-v2/src/features/voice-notes/use-voice-pipeline.ts#L85-L93) — Missing optimistic cache merge after voice summary**  
   Bug: User sees stale voice card without title/summary until next refetch. Add `queryClient.setQueriesData()` in `onSuccess` per R3 fix.

2. **[infra/db-types.ts:4](apps/mobile-v2/src/infra/db-types.ts#L4) — Generate Supabase types instead of manual declarations**  
   Run `supabase gen types typescript --project-id <id>` and replace entire file. Prevents schema drift.

3. **[uploader.ts:228, 249](apps/mobile-v2/src/features/uploads/uploader.ts#L228) — Replace `Math.random()` storage suffixes with UUID-derived**  
   Change `Math.random().toString(36).slice(2, 10)` to `newId().slice(0, 8)`. Violates standard-path-first §Math.random.

4. **[recorder.ts:7-23](apps/mobile-v2/src/features/voice-notes/recorder.ts#L7-L23), [audio-playback-provider.tsx:24-42](apps/mobile-v2/src/features/audio/audio-playback-provider.tsx#L24-L42) — Port expo-av stubs to expo-audio**  
   Voice features non-functional until migration complete. ~200 LOC work.

5. **[voice-note-card.tsx:34](apps/mobile-v2/src/features/voice-notes/voice-note-card.tsx#L34) — Generate signed URLs for storage playback**  
   Comment says `// TODO: Generate signed URL`. Currently passes raw `storage_path`, which may not be publicly accessible.

6. **Upload queue R11 bridging — Add stable key + capture-time sort to timeline**  
   Pending photo rows will unmount when real row appears. Port `voiceStableKey` pattern from v1 to photo upload.

7. **[report-edit-form.tsx](apps/mobile-v2/src/features/reports/components/report-edit-form.tsx) — Extract array-editor pattern**  
   Roles, materials, issues sections all use identical add/remove/edit pattern. Extract `<ArrayEditor>` component. ~80 LOC reduction.

8. **[jobs.ts:332](apps/mobile-v2/src/features/uploads/jobs.ts#L332) — Backoff jitter uses Math.random (acceptable but document)**  
   Not security-critical but violates letter of rule. Add comment justifying jitter use case.

9. **[onboarding-screen.tsx:41](apps/mobile-v2/src/features/auth/onboarding-screen.tsx#L41) — Implement profile update mutation**  
   `// TODO Phase 1: implement profile update mutation` — onboarding screen non-functional.

10. **Add RLS test coverage for new mutations**  
    Projects, reports, notes mutations have zero RLS tests in `mobile-v2/`. Port coverage from v1 or add new `rls_mobile_v2.test.ts`.

---

## E. LOC Comparison

| Feature | v1 LOC (hotspots) | v2 LOC | % Reduction | Notes |
|---------|-------------------|--------|-------------|-------|
| ReportEditForm | 800 | 290 | **64%** | v2 uses helpers, no inline validation |
| VoiceNoteCard | 550 | ~150 (stub) | **73%** | v2 Sheet composition, audio stubbed |
| Upload queue | 450 | 450 | 0% | Verbatim port per doc |
| AudioPlayback | 450 | ~200 (stub) | **56%** | v2 simpler lifecycle, audio stubbed |
| Hooks (reports) | ~200 | ~80 | **60%** | v2 no optimistic logic yet |
| **Total mobile-v2** | N/A | **~10k** | N/A | Across ~120 files |

**Key drivers of reduction:**
- Sheet compound pattern eliminates dialog boilerplate
- Inline fixture mode (no callback injection)
- Pure state machines (jobs.ts) fully testable without mocks
- No optimistic updates (yet) — simpler mutation hooks

**Watch:** v1 had 22.5k LOC. v2 at ~10k is 55% reduction, but voice/upload features are stubbed. Final parity estimate: ~14k LOC (38% reduction).

---

## F. Morning To-Do (Priority Order)

### **Immediate (before any feature work)**

1. **Generate Supabase types** — `cd apps/mobile-v2 && supabase gen types typescript --project-id <id> > src/infra/db-types.ts`  
   Blocks: All DB interactions until types match schema.

2. **Port expo-audio** — Replace stubs in [recorder.ts](apps/mobile-v2/src/features/voice-notes/recorder.ts), [audio-playback-provider.tsx](apps/mobile-v2/src/features/audio/audio-playback-provider.tsx)  
   Blocks: Voice recording, playback, voice pipeline E2E.

3. **Fix voice pipeline optimistic merge** — Add `queryClient.setQueriesData()` in [use-voice-pipeline.ts:onSuccess](apps/mobile-v2/src/features/voice-notes/use-voice-pipeline.ts)  
   Prevents: R3 recurrence (stale UI post-summarize).

4. **Replace Math.random in uploader** — [uploader.ts:228, 249](apps/mobile-v2/src/features/uploads/uploader.ts#L228)  
   Prevents: Standard-path-first violation flag.

### **High Priority (before Maestro flows)**

5. **Implement onboarding profile mutation** — [onboarding-screen.tsx:41](apps/mobile-v2/src/features/auth/onboarding-screen.tsx#L41)  
   Blocks: User signup flow.

6. **Add pending photo/document row bridging** — Port R11 stable-key pattern from v1  
   Prevents: Flicker on upload completion.

7. **Generate signed URLs for voice playback** — [voice-note-card.tsx:34](apps/mobile-v2/src/features/voice-notes/voice-note-card.tsx#L34)  
   Prevents: 403 errors on private storage paths.

### **Medium Priority (code quality)**

8. **Extract ArrayEditor component** — Dedupe roles/materials/issues sections in [report-edit-form.tsx](apps/mobile-v2/src/features/reports/components/report-edit-form.tsx)

9. **Add RLS test coverage** — Port `rls_projects.test.ts`, `rls_reports.test.ts` patterns from v1

### **Nice-to-Have (docs/polish)**

10. **Document backoff jitter Math.random** — Add justification comment to [jobs.ts:332](apps/mobile-v2/src/features/uploads/jobs.ts#L332)

---

## Summary Table

| Severity | Count | Blocker? |
|----------|-------|----------|
| CRITICAL | 1 | Yes (expo-audio stubs) |
| HIGH | 4 | Yes (types, optimistic merge, Math.random, onboarding) |
| MEDIUM | 5 | No (but should fix before E2E) |
| LOW | 0 | — |

**Verdict:** **WARNING** — 1 CRITICAL (audio port), 4 HIGH issues. No ship-blocking security issues, but voice features non-functional and several R-pattern recurrence risks (R3, R11). Code quality is strong (design principles followed, no callback injection, consistent patterns). Fix CRITICAL + HIGH before Maestro flows.