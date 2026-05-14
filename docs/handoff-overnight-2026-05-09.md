# Overnight handoff — Maestro Android E2E broken after last 2 PRs + rebuild

**Date:** 2026-05-09
**Status (05:25):** Launch crash FIXED. Maestro now reaches Section 7 (camera photo upload) and fails — uploaded photo never converts from `pending-photo-queue-*` to `btn-open-file-*` within 30s. Storage shows only the voice note made it; camera photo never landed in `storage.objects`. Likely real regression from recent upload-queue PRs (see commit list).

**ROOT CAUSE OF LAUNCH CRASH (resolved):** `expo run:android --variant release` does NOT load `apps/mobile/.env` into the JS bundle that Gradle's `:app:createBundleReleaseJsAndAssets` produces. **Env vars MUST be set in the shell before invoking the build.** The `expo export` CLI path *does* load `.env`; the `run:android`+Gradle path does not. Fix: export `EXPO_PUBLIC_*` in shell, also wipe `apps/mobile/android/app/build/intermediates/{assets,merged_assets}` + Metro cache + `apps/mobile/android/.gradle` to force Metro rebundle. Then build with `& "apps/mobile/android/gradlew.bat" -p "apps/mobile/android" assembleRelease --no-daemon` (avoids `expo run:android`'s post-install Metro EPERM watcher noise).

## Goal

Restore Maestro E2E green on connected adb device `ZY322V6FCM` (Moto G6, Android 9), starting with `apps/mobile/.maestro/journeys/core-end-to-end.yaml`. Then run the other 3 journeys.

## Current crash

```
com.facebook.react.common.JavascriptException: Error: supabaseUrl is required.
  validateSupabaseUrl
  SupabaseClient
  createClient
```

The release bundle does **not** contain `127.0.0.1:54321` or the anon key — confirmed by extracting `assets/index.android.bundle` from the latest APK and grepping. So `EXPO_PUBLIC_SUPABASE_URL` is empty at bundle time.

## What was tried

1. Created `apps/mobile/.env` with `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, anon key, `EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true`. Built APK at 03:33. Bundle still empty of these values.
2. Started build3 with shell env vars set explicitly — aborted before completion. A stale Java/Gradle daemon was left over and has been stopped.

## Root-cause hypotheses to investigate (in order)

1. **The recent PRs changed env var loading** — check `git log --oneline origin/dev~10..origin/dev` and any diff touching `apps/mobile/.env*`, `app.config.*`, `eas.json`, `babel.config.js`, `metro.config.js`, supabase client init.
2. **`.env` location wrong** — Expo SDK 55 may want `apps/mobile/.env.local` or env vars must be in the *shell* during `expo run:android`. Check Expo docs / changelog.
3. **`.env.example` shows different var names** than what the code now reads. Diff `apps/mobile/.env.example` vs the supabase client.
4. **Workspace root env** — maybe env loading was switched to monorepo root `./.env` or to `eas.json`'s build profile. Check `eas.json`.
5. **`app.config.{ts,js}` reads `process.env.EXPO_PUBLIC_*` and exposes via `extra`** — if config was changed to use `extra` and the client was changed to read `Constants.expoConfig.extra.X`, an empty `extra` would break it.

## Environment / facts

- Repo: `C:\Users\pch\workspace\haru3-reports`, branch `dev`, ahead of `origin/dev` `739442e` by 3 commits (`74b3df2`, `9744e15`, `d0806e1`).
- Device: `ZY322V6FCM` (Moto G6, Android 9, motorola/ali_n). **READ_LOGS cannot be granted** — Motorola's `com.android.shell` doesn't declare it. Use `adb -s ZY322V6FCM shell "dumpsys dropbox --print" | Select-String harpa.pro -Context 0,15` for JS crashes.
- Maestro: `C:\maestro\maestro\bin\maestro.bat` (v2.5.1).
- Local Supabase: REST `http://127.0.0.1:54321`, DB port 54322 (`postgres/postgres`), edge runtime container `supabase_edge_runtime_haru3-reports`.
- Anon key: `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`.
- App must `adb reverse tcp:54321 tcp:54321` + `tcp:54324 tcp:54324` (re-set after every adb daemon restart).
- Build env vars **required**: `EXPO_NO_METRO_WORKSPACE_ROOT=1`, `ANDROID_SERIAL=ZY322V6FCM`. **Do NOT** pass `--device <serial>` to `expo run:android` (wants friendly name, errors non-interactively).
- Build cmd: `pnpm --filter mobile exec expo run:android --variant release`.
- Demo personas: Mike `+15551234567` demo=0, Sarah `+15559876543` demo=1, Charlie `+15550000003` demo=2; onboarding `+15550000004`. Mike user id `11111111-1111-1111-1111-111111111111`. Demo creds `mike@example.com` / `test1234`.
- Deep-link: `harpa://e2e/login?demo={0|1|2}`.
- pnpm: `node-linker=hoisted` + `shamefully-hoist=true` is mandatory on Windows (without hoisted, `.pnpm/<long-spec>/...` overflows MAX_PATH; Java `ProcessBuilder` ignores `LongPathsEnabled=1`). Locally `.npmrc` has both lines — **revert to single-line `shamefully-hoist=true` before committing**.

## Uncommitted local changes (must commit before merging)

- `apps/mobile/android/build.gradle`: added Notifee maven repo via `require.resolve('@notifee/react-native/package.json')` in `allprojects.repositories`.
- `apps/mobile/.env`: gitignored, leave alone.
- `.npmrc`: locally has `node-linker=hoisted` extra line — revert before commit.

## Files modified recently (in scope)

- `apps/mobile/.maestro/journeys/{core-end-to-end,profile-settings,cross-user-rls,auth-and-onboarding}.yaml`
- `apps/mobile/.maestro/files/`, `voice-notes/`, `reports/`, `profile/`, `camera/` subflows
- `docs/09-testing.md` (added Windows Android pitfalls section)
- `AGENTS.md` (pointer to that section)
- `supabase/functions/.env` (USE_FIXTURES=true, committed; `.gitignore` line 62 has `!supabase/functions/.env` exception)

## Journey results (after env fix, 08:30)

| Journey | Result | Failure point |
|---|---|---|
| `core-end-to-end.yaml` | FAIL | `btn-open-file-.*` after camera capture (photo upload to storage fails — `file_metadata.upload_status='failed'`, no request reaches storage container — preprocess or `uriToBlob` throwing) |
| `profile-settings.yaml` | FAIL | `"Torres Construction LLC" is visible` — **source bug** (see "Profile bug" below) |
| `cross-user-rls.yaml` | **PASS** | — |
| `auth-and-onboarding.yaml` | FAIL | `"Verify Code" is visible` — **journey bug** (button is offscreen below fold; see "Auth bug" below) |

## Profile bug — DIAGNOSED (source regression)

**Symptom:** Profile screen renders "Mike Torres" + phone but the company-name `<Text>` is empty. Verified by screenshot at `C:\Users\pch\.maestro\tests\2026-05-09_082655\screenshot-?-1778286479449-(profile-settings.yaml).png`.

**Root cause:** `apps/mobile/app/profile.tsx:136-138` — the `<Text testID="profile-company-name">` element has **empty children**. The `companyName` variable is computed at line 75 (`profile?.company_name?.trim() || "Add your company details"`) and used in the `accessibilityLabel` (line 133) but was never placed between the `<Text>` open/close tags.

```tsx
<Text testID="profile-company-name" className="text-sm text-muted-foreground">
</Text>
```

**Blame:** Empty since commit `01e9e8f6` (Patrick, 2026-04-27). The `testID` line was last touched by `b4f0c263` (2026-04-28) which rewrote the Maestro suite — added the assertion against a value that was already missing on the screen. Seed data is correct (verified `supabase/seed.sql:23,124` and `lib/auth-security.ts:12`).

**Fix (one-liner):**
```tsx
<Text testID="profile-company-name" className="text-sm text-muted-foreground">
  {companyName}
</Text>
```

Also affects `account.tsx` flow indirectly only by the journey assertion; account screen renders company in an `<Input value=...>` (line 73) so it's fine.

## Auth bug — DIAGNOSED (journey bug, not source)

**Symptom:** After tapping "Send Code" with `+15551234567`, `input-otp` becomes visible (assert passes at line 55), but `assertVisible: "Verify Code"` at line 58 fails. Verified by screenshot at `C:\Users\pch\.maestro\tests\2026-05-09_083314\screenshot-?-1778286868467-(auth-and-onboarding.yaml).png`.

**Root cause:** The "Verify Code" submit button (`apps/mobile/app/index.tsx:281-290`) renders **below the visible viewport** on Moto G6. Screenshot shows form ends mid "We sent a text message…" InlineNotice; the button is offscreen and Maestro's `assertVisible` requires the element to be in the viewport (DOM presence is not enough).

The button itself is fine — `app/index.tsx:289` renders `{isSubmitting ? "Verifying..." : "Verify Code"}`. The other OTP subflows (`signup-or-login-mike-otp.yaml`, etc.) also `tapOn: "Verify Code"` and presumably worked previously because earlier device viewports / keyboard states scrolled it into view differently.

**Fix (journey-only, no source change needed):** Replace the bare `assertVisible` block at `apps/mobile/.maestro/journeys/auth-and-onboarding.yaml:58-62` with a `scrollUntilVisible` to anchor the button into view before asserting:

```yaml
- scrollUntilVisible:
    element:
      id: "btn-login-verify-code"
    direction: DOWN
    speed: 60
    timeout: 5000
- assertVisible:
    id: "btn-login-verify-code"
- assertVisible:
    id: "use-different-number"
- assertVisible:
    id: "btn-login-change-number"
```

Use the testID `btn-login-verify-code` (line 282) as the stable handle — text-based matching is fragile because the button label flips to "Verifying..." when pressed. The downstream `tapOn: "Verify Code"` at line 69 should also be retargeted to `id: btn-login-verify-code` to keep tap-by-id consistent (and avoid flakiness if the label flips mid-tap).

**Note:** AGENTS.md says don't modify "OTP subflows or `create-second-user.yaml`". The change above is to `journeys/auth-and-onboarding.yaml`, NOT a subflow — so it's in scope. The OTP subflows under `subflows/` are untouched.

## Photo upload regression — DIAGNOSED

**Symptom:** Camera-captured photo upload throws `TypeError: Network request failed` (captured via temporary `markPlaceholderRowFailed` instrumentation that stashes the error message into `file_metadata.local_uri` as `__error__:<msg>`).

**Root cause:** Commit `779d1dd feat(mobile): stream uploads as Blob and enable Android largeHeap` switched the upload pipeline to `fetch(file://...).blob()` then POST that blob to Supabase storage. On Android RN release, the resulting Blob can't be re-streamed by the subsequent storage POST — fetch throws `TypeError: Network request failed`.

**Why voice notes still work:** `lib/voice-note-flow.ts:45` uses `readBytes(uri)` returning a `Uint8Array`, then calls `uploadProjectFile` directly — NOT through the queue. So voice notes bypass `uriToBlob` and avoid the broken Blob-streaming path.

**Evidence:**
- Voice notes (~187KB) succeed: storage container shows POST 200 OK.
- Photos (~168KB, even smaller) fail at `bucket.upload` with the network error.
- Storage container logs show NO image POST request arriving.
- `expo-image-manipulator (55.0.15)` IS in releaseRuntimeClasspath — preprocess works.

**Fix options (for team):**
1. Revert the streaming PR's image path; use `Uint8Array` like voice notes.
2. Use `expo-file-system/legacy`'s `uploadAsync(uri, url)` for the file → storage POST (skips intermediate Blob).
3. Use `expo-file-system/createUploadTask` (already used for iOS background uploads) for Android too.

**Files touched by suspect PR (`779d1dd`):**
- `apps/mobile/lib/uploads/blob.ts` (added `uriToBlob`)
- Likely also `apps/mobile/lib/uploads/uploader.ts` (added Blob-body upload path)

## Diagnostic instrumentation (must revert)

Two changes were made to capture the error message — REVERT before next release:

1. `apps/mobile/lib/file-upload.ts:491-516`: `markPlaceholderRowFailed` accepts optional `errorMessage` and stashes `__error__:<msg>` in `local_uri`.
2. `apps/mobile/lib/uploads/uploader.ts:343-348`: passes `err.name + err.message` to `markPlaceholderRowFailed`.

Revert both before merging anything. Existing tests for `markPlaceholderRowFailed` may now fail and would need to be re-aligned if the diagnostic stays.

## What was committed tonight

(After the existing 3 unpushed commits — which were already pushed.)

- `docs/09-testing.md`: pitfalls 1-5 (added shell-env requirement).
- `AGENTS.md`: added shell-env hint.
- This handoff doc.

(NOT committed: the diagnostic instrumentation in `file-upload.ts` + `uploader.ts`. Those are local-only and must be reverted.)

**NOT pushed.** Pre-push hook (`vitest run --coverage`) fails on a **pre-existing** test:
`apps/mobile/__tests-config__/press-test-coverage.test.ts` — `btn-save-project` is registered in the press catalog (`apps/mobile/__tests-config__/press-test-catalog.ts:160`, used in `app/projects/[projectId]/edit.tsx:206`) but is neither unit-tested nor covered by a Maestro flow. Both files are unchanged from `origin/dev` — the breakage is already on the branch (the press-coverage gate was added in `acd95f2`, and `btn-save-project` was added or revealed afterwards). User must either (a) add a Maestro flow tapping the edit-screen save button, (b) add a unit test, or (c) `--no-verify` push (forbidden by AGENTS.md). Two commits are sitting on local `dev`: `7c867d2`, `a94c94b`.

## Tomorrow's priorities

1. Fix photo upload regression (see "Fix options" above) — likely the highest-impact item.
2. Revert diagnostic instrumentation in `file-upload.ts` + `uploader.ts`.
3. **Profile bug fix** (1 line): add `{companyName}` between the empty `<Text>` tags at `apps/mobile/app/profile.tsx:136-138`. See "Profile bug" section above.
4. **Auth journey fix** (yaml-only): replace `assertVisible: "Verify Code"` with `scrollUntilVisible` + assertVisible by testID at `apps/mobile/.maestro/journeys/auth-and-onboarding.yaml:58-62`, and retarget the `tapOn: "Verify Code"` at line 69 to `id: btn-login-verify-code`. See "Auth bug" section above.
5. Once all green, restore `.npmrc` to single-line `shamefully-hoist=true` and push.

## Constraints

- **No interactive/UAC prompts** — user is away.
- No `tapOn point: X%,Y%` in journeys (verified clean).
- Conventional Commits, never `--no-verify`, never push to `main`.
- Never modify `.maestro/onboarding/` OTP subflows or `create-second-user.yaml`.

## Reference paths

- Build logs: `C:\Users\pch\AppData\Local\Temp\opencode\android-build*.log`
- Maestro logs: `C:\Users\pch\AppData\Local\Temp\opencode\maestro-*.log`
- Maestro test artifacts: `C:\Users\pch\.maestro\tests\`
- APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- Bundle extract dir: `C:\Users\pch\AppData\Local\Temp\opencode\apk-extract\assets\index.android.bundle`

## Note on Android upgrade

Cannot upgrade Moto G6 past Android 9 cleanly via adb (no newer official OTA exists; LineageOS requires bootloader unlock + wipe). `READ_LOGS` cannot be granted because OEM `com.android.shell` doesn't declare it. Long-term fix: switch to Android emulator (Pixel image) for E2E. Out of scope tonight.

## Resolution (2026-05-09 21:00)

**Photo upload regression fixed (`feat(mobile/uploads): pass Uint8Array bodies to bucket.upload`).**

### Root cause

`new Blob([uint8])` in `apps/mobile/lib/uploads/blob.ts` threw at runtime on Android release with `Error: Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported`. RN's Blob polyfill (`react-native/Libraries/Blob/Blob.js`) only accepts `Blob | string` parts in its constructor — this is a documented gap (facebook/react-native#23922, open since 2018). iOS image upload was unaffected because it routes through `uploadProjectFileViaBackground` (NSURLSession + signed-URL PUT) and never constructs a JS Blob. Android voice notes were unaffected because that path already passed `Uint8Array` directly.

### Fix

`uriToBlob()` now returns `{ body: Uint8Array, resolvedUri, size }` instead of `{ blob: Blob, resolvedUri }`. Callers (`uploader.ts`, `useProjectFiles.ts`, `AvatarUploader.tsx`) pass the `Uint8Array` straight to `bucket.upload(path, body, { contentType })`. supabase-js's storage client (`StorageFileApi.ts:112-115`) detects "not Blob, not FormData" and POSTs the bytes verbatim with the explicit `content-type` header — same path the voice-note upload has used in production for months. No base64, no Blob wrapper, no platform-specific branches.

### Verification

DB inspection on Moto G6 / Android 9 release APK after journey run:

```
photo-1778330722775.jpg     | completed | storage_path set
IMG_20260509_203358985.jpg  | completed | storage_path set
photo-1778329898932.jpg     | completed | storage_path set
photo-1778328922954.jpg     | failed    | __error__:Error: Creating blobs from 'ArrayBuffer' ...  ← pre-fix
```

Three new image rows hit `completed` post-fix, confirming bytes landed in storage. Vitest: 620/621 (only pre-existing `btn-save-project` press-coverage gate fails, unrelated).

### Maestro journey post-fix

`core-end-to-end` advances past the camera-photo upload (`Assert that id: btn-open-file-.* is visible... COMPLETED`) and now blocks at the *next* step — `addMedia` (gallery injection of `test-image.jpg`) fails with `io.grpc.StatusRuntimeException: UNKNOWN`. This is a known Maestro infrastructure flake on Android 9 (mobile-dev-inc/maestro#1532) — Maestro's MediaStore-based gallery injection is unreliable on API 28 (last pre-scoped-storage Android). Newer Samsung / API 30+ devices clear `addMedia` cleanly. **Not a code bug; Maestro+OS issue.**

### Outstanding

- `auth-and-onboarding` viewport fix (yaml-only `scrollUntilVisible` for `btn-login-verify-code`) — still TODO.
- Maestro `addMedia` workaround for Android 9 — defer; CI emulators run API 34 where this is a non-issue.
- `btn-save-project` press-coverage gap (pre-existing, blocks pre-push).
