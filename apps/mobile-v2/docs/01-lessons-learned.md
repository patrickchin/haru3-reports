# Lessons Learned (from v1 bugs)

## 1. Bug Taxonomy

| ID | Name | Failure Shape | Design Rule for v2 |
|----|------|---------------|-------------------|
| R1 | Fixture-mode stubs hiding real failures | Edge function writes bypassed, DB never updated, UI lies in mock mode | Only stub the LLM/model call; let all side effects (DB, storage) hit the local Supabase stack |
| R2 | `optional: true` silencing assertions | Test passes whether element appears or not; feature invisible in mock mode | `optional: true` only for flow-skipping, not assertion-skipping. Drop flag for "must appear" cases |
| R3 | Mutation without optimistic cache update | Stale data visible 0–500ms post-mutation; identical to "server write broken" | Always pair `invalidateQueries` with `setQueriesData` optimistic merge |
| R4 | Mocked tests crossing I/O boundaries | Unit mocks pass; edge function or DB write is broken; caught only by manual QA | Every client→edge→DB→refetch path needs at least one integration test (Maestro counts) |
| R5 | Threshold-gated UI hidden in fixtures | Feature invisible in mock mode because fixture data doesn't cross threshold | Bump fixture payload above threshold by comfortable margin when adding size gates |
| R6 | testID drift: components vs. flows | Maestro selectors fail even though product code works; flows authored from memory | Update testID catalog and all flows in same PR; run flows before PR |
| R7 | Fixture-dependent flows unmarked | Non-fixture suite tries to run a fixture-only flow; false negatives when fixtures unavailable | Tag fixture-dependent flows at creation; filter from production-preview suites |
| R8 | Hard-coded cleanup nav depth | One `btn-back` fails when flow starts deeper or screens add intermediate steps | Derive cleanup nav from actual depth at failure point; use idempotent re-navigation or `launchApp: { clearState: false }` |
| R9 | E2E timeouts from harness drift | Debug product code; actually testID missing or screen wrong | Check: (1) can backend complete op, (2) does testID exist, (3) right screen. Only then suspect code |
| R10 | RLS fixes incomplete across entry points | One policy passes; revoked members slip through a different write surface or parent soft-delete leaks | Test full matrix: active/revoked role, direct DELETE, every SECURITY DEFINER RPC, parent tombstone, mismatched linkage |
| R11 | Optimistic-row swap unmount during async link | Real row appears on-screen after entity lands but relationship row pending; old row unmounts first, every sibling jumps | Optimistic entry bridges gap: carries eventual entity id (`fileId`), uses stable key on both pending/real rows, sorts by capture time |

---

## 2. Per-Bug Lessons

**2026-05-08 — Voice-note auto-summary invisible in fixture mode.** Three stacked bugs: edge-function fixture stub completely bypassed the DB write (stubs `updateFileMetadataFn → async () {}`), so `file_metadata.voice_title` never landed; the hook's `onSuccess` only invalidated queries instead of optimistically merging the title and summary into cache; and the Maestro flow marked the "Summary" assertion `optional: true`, silencing test coverage entirely. The fix required letting the local Supabase stack run the real write in fixture mode, adding optimistic cache merge in the hook, and removing `optional: true` from assertions, then adding specific testIDs for the title/summary blocks. → **Rule: Fixture stubs may mock the LLM, but side effects (DB, storage) must hit the real local stack. Optimistic cache merges are not optional when the user sees data immediately after a mutation. Maestro `optional` is for flow skipping, not assertion skipping.**

**2026-05-08 — Maestro upload-queue flows drifted from product reality.** The media-pipeline UI changed (report IDs, navigation depth, pending-vs-completed upload states), but the Maestro flows were authored from memory instead of against the live component testID catalog. Assertions matched stale IDs, navigation assumptions were wrong, and state expectations didn't tolerate fast uploads. The fix was mechanical: audit every testID in the flows against the live catalog, retarget assertions to current tabs/screens, accept pending-or-completed state, and run the flows once locally before PR. → **Rule: When a component testID or navigation structure changes, update the Maestro catalog and all flows in the same PR. Run the affected flows at least once locally before opening the PR. Never author flows from memory.**

**2026-05-09 — Report-note RLS hardening kept exposing sibling entry points.** Adding optimistic text notes seemed like a mobile-only UX change, but it exposed missing authorization checks across multiple write surfaces: direct PostgREST, SECURITY DEFINER RPCs, triggers, and legacy paths. A revoked uploader could still mutate files, a removed note author could edit old notes, and soft-deleted projects left active child rows visible. The fix required DB invariants (FK indexes, preflight checks), role checks on every write surface, denying direct DELETE for soft-delete tables and routing through RPCs, and RLS tests covering the full matrix: active/revoked roles, direct UPDATE/DELETE bypasses, every RPC, parent tombstone visibility, and mismatched project/report/file linkage. → **Rule: RLS fixes are incomplete when only one policy passes. For any table with denormalized ownership or soft-delete semantics, test the full matrix: active/revoked role, direct DELETE, every RPC, parent soft-delete visibility, and cross-table linkage mismatches.**

**2026-05-10 — Photo-upload completion shifted the report-notes timeline.** When an upload completed, three asynchronous steps caused visible flicker: the queue removed the pending-photo row immediately, the replacement file row had a different React key, and the sort position jumped because the new row used server `created_at` instead of capture time. The pattern was solved once for voice notes via `voiceStableKey` but missed for photos. The fix mirrored that bridge: add `PendingPhotoItem.fileId` and propagate from `UploadJob.fileId`, extend the file `TimelineItem` with `photoStableKey` and `photoStableAddedAt`, make `useNoteTimeline` promote the real row through the gate as soon as the entity id is known (before the relationship row lands), key the rows with the stable key, and sort by capture time. Four unit tests cover the pending-photo bridging scenario. → **Rule: When an optimistic→real swap depends on two asynchronous server writes (entity row + relationship row), the optimistic entry must carry the eventual entity id and stay in place to bridge the gap. Promote the real row through the display gate as soon as the entity id is known. Use the optimistic entry's stable key as the React key on both rows. Sort by optimistic capture time, not server `created_at`, until the relationship row arrives.**

---

## 3. Standard-Path-First Violations to Avoid

- **Do not hand-roll binary codecs** (`atob`, char-code loops, `Uint8Array` construction for byte shuffling). Use `fetch(uri).blob()` for files and let the storage client stream natively. The Supabase docs, React Native fetch spec, and `expo-image-picker` examples all show this as the one-line standard.
- **Do not use `Math.random()` for IDs, tokens, nonces, or anything security-adjacent.** Use `crypto.randomUUID()`, WebCrypto, or platform equivalents. Random IDs will silently break UUID-strict PostgREST columns.
- **Do not use system `Alert.alert()` for in-app dialogs, pickers, or confirmations.** Use `AppDialogSheet` or a themed UI primitive so prompts match the rest of the app's styling (already established pattern in codebase).
- **Do not mock the I/O primitive being changed in tests.** If testing a file upload, mock Supabase but use a real `fetch` or real `FileSystem` call. Testing the mock teaches nothing about the actual path.
- **Do not string-interpolate SQL, shell commands, or HTML.** Always use parameterized APIs, Postgres SECURITY DEFINER RPCs, or vendor-blessed SDKs.
- **Do not hand-roll base64 → string → bytes conversions.** Use `TextEncoder`, `Buffer.from`, or native streaming APIs. Base64 is for metadata in JSON, not for moving file payloads.
- **Do not directly inline JSON with `JSON.parse(x) as T`.** Use Zod, valibot, or pydantic for schema validation. Type assertions are not validation.

---

## 4. Test-Coverage Rules

- **Mocked unit tests prove the handler fires; they do not prove the handler works.** If a test mocks `expo-file-system`, `Storage.upload`, or `fetch`, it is testing the mock, not the real path. For upload, photo capture, or any I/O, include at least one integration test that exercises the entire chain without seams.
- **Mock tests for hooks that call edge functions will pass even when the edge function is broken.** Unit tests are insufficient for paths that cross client→edge→DB→refetch boundaries. Use Maestro in fixture mode (counts as integration) for these.
- **Coverage % is not coverage of the failure mode.** High line coverage can coexist with zero coverage of realistic input sizes. When a bug's root cause is memory or performance, the fixture must use realistic payloads (e.g., 10 MB photos, 400+ char transcripts).
- **Fixture payloads must cross any threshold gated by UI.** If a UI element appears only when `transcript.length > 400`, the fixture must have ≥ 400 characters. Features invisible in mock mode are invisible to everyone until production.
- **Maestro `optional: true` silences assertions; do not use it to skip validation.** Use it only for "this element might not be present" cases (e.g., empty state vs. full list). For "this must appear", drop the flag.
- **RLS tests must not mock the database.** A Vitest suite that mocks the client will pass even when the RLS policy is broken. Use `pnpm test:rls:local` (real Postgres) or `pnpm test:rls:hosted` for every RLS change.

---

## 5. Library & Dependency Hard Constraints

- **Hermes release builds on iOS may not expose `globalThis.crypto`.** Any fallback UUID generation must be RFC 4122-shaped; UUID-like strings that do not conform (e.g., `<timestamp>-<random>`) will silently fail PostgREST 400 on insert/query.
- **PostgREST returns 400 (no body in Kong logs) for:** insert payloads with non-existent columns, filter values that do not parse as the column type (e.g., non-UUID string against a `uuid` column), or filter URIs like `?id=eq.<bad>`. Reproduce with curl using the exact same payload to see the JSON error body in the PostgREST container.
- **Supabase edge functions under `USE_FIXTURES=true` may time out or not expose auth state reliably.** Short-circuit fixture checks before auth in fixture mode. Do not rely on `fetch ${SUPABASE_URL}/auth/v1/user` from inside the edge-runtime container; the wall-clock budget is tight.
- **`expo-image-picker` recommends `fetch(uri).blob()` for all uploads.** That is the streaming standard. Base64 is a smell.
- **Android `notifee` requires the maven repo in `android/build.gradle`** under `allprojects.repositories`, pointed at `<@notifee/react-native>/android/libs`. Missing it causes `Could not find app.notifee:core:+`.
- **Windows Android release builds require five things in order:** (1) `.npmrc` with both `shamefully-hoist=true` and `node-linker=hoisted` to avoid MAX_PATH overflow; (2) wipe `.gradle`, `app/build`, `.cxx` caches after package path changes; (3) Notifee maven repo in `android/build.gradle`; (4) use `$env:ANDROID_SERIAL` not `--device`; (5) export all `EXPO_PUBLIC_*` vars in the shell before invoking the build (Metro's Gradle plugin does not load `apps/mobile/.env`).
- **`EXPO_PUBLIC_*` environment variables are inlined by Metro at bundle time.** Changing them requires a rebuild, not a hot reload. Verify with `grep` on the APK bundle's `index.android.bundle` to confirm the value was inlined.
- **Local Supabase migration list must show all rows with "Local" column populated.** If a migration is missing, run `supabase db reset --local` to re-apply `seed.sql`. The seeded demo users (Mike, Sarah, Charlie) depend on this.

---

## 6. Must-Have Guardrails for v2

1. **Before any non-trivial I/O change, answer in writing:** (a) What is the standard, documented way? (b) Are we doing it that way? (c) If not, why not (concrete reason)? (d) What does the hand-rolled alternative cost? If any answer is missing, the design is not ready.

2. **Architect pass for any file, image, audio, or large blob reads/writes.** Include realistic *p95* input size (photos: 12 MB, videos: 200 MB, voice notes: 10 MB), heap analysis (JS vs. native), and justification if not using the streaming path.

3. **Every RLS or soft-delete change must ship with a test in `supabase/tests/rls_*.test.ts` covering the full matrix:** active/revoked role, direct UPDATE/DELETE attempts, every SECURITY DEFINER RPC, parent soft-delete visibility, and cross-table linkage mismatch. If a helper like `user_has_project_access()` changes, add a child-table regression too.

4. **Maestro flows must reference the testID catalog,** not inline strings remembered from an older UI. Update the catalog and all flows in the same PR. Run flows once locally before PR.

5. **Optimistic cache merges are mandatory after mutations** if the user sees data immediately. Always pair `invalidateQueries` with `setQueriesData` optimistic patch.

6. **Fixture payloads must cross any UI threshold** (size gates, character counts, etc.). Add large-photo and long-transcript fixtures to `__tests__/fixtures/` and reference them in integration tests.

7. **No `optional: true` on assertions that must pass.** Use it only for flow-skipping (element might genuinely not be present). For "this must appear", drop the flag and fail the flow if missing.

8. **Fixture-mode stubs must let side effects (DB, storage) hit the local Supabase stack.** Only stub the LLM/model call itself. The local stack is what `pnpm ios:mock` is built on; credentials are there.

9. **Every entry point for an authorization decision must be tested.** Table RLS policies, SECURITY DEFINER RPCs, triggers, direct DELETE routes, and legacy paths all need coverage. Fixing one surface exposes sibling gaps.

10. **Optimistic→real row swaps that depend on two async server writes must bridge the gap.** The optimistic entry carries the eventual entity id and stays in place until both writes land. Use a stable React key on both rows. Sort by optimistic timestamp, not server `created_at`.

11. **Do not use system `Alert.alert()` for in-app interactions.** Use `AppDialogSheet` or a themed UI primitive (established pattern: see `apps/mobile/components/AppDialogSheet.tsx`).

12. **Integration tests for I/O paths must use realistic input.** Mocking the storage client + mocking the file system = testing the mock. Use real `FileSystem` calls against temporary files, or test with the actual fixture media.

13. **Pre-flight checks before any Maestro run:** (a) local Supabase up (`npx supabase status`), (b) all migrations applied (`npx supabase migration list --local`), (c) edge functions restarted with current code, (d) binary points at local URL with matching anon key. If demo logins land on onboarding instead of Projects, the seed didn't run.

14. **Fixture-dependent flows must be tagged and filtered.** Maestro suite running against production-preview builds should not attempt fixture-only flows. Add `tags: [fixture-mode]` at creation; filter in CI.

15. **No hand-rolled UUID construction.** Use `crypto.randomUUID()`. Random-like strings that do not conform to RFC 4122 will silently fail PostgREST 400 queries against `uuid` columns.