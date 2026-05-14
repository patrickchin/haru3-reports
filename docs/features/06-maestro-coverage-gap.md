# Maestro coverage gap report

> **Status (2026-05-07):** the §6 "In-app `forceOffline` toggle + 6
> offline flows" proposal is **superseded** — offline mode v1 was
> removed in `refactor/remove-offline-mode` (see
> [docs/features/local-first-offline/removal-plan.md](local-first-offline/removal-plan.md)).
> The rest of this report (route + testID coverage gaps for the online
> flows) is still valid.

> Generated 2026-05-02. Sources:
> - Coverage script: `apps/mobile/.maestro/scripts/coverage.mjs`
> - Recent commits: `git log --since="2 weeks ago" origin/dev`

## Baseline

| Metric         | Covered | Total | %     | Threshold |
| -------------- | ------- | ----- | ----- | --------- |
| Routes         | 11      | 14    | 78.6% | 90%       |
| testIDs        | 37      | 74    | 50.0% | 90%       |

Both metrics fail the 90% bar. Run `node .maestro/scripts/coverage.mjs`
from `apps/mobile/` to refresh.

## Recent features (last 2 weeks of `dev`) and flow status

| Feature | Key commits | Existing flows | Gaps |
| ------- | ----------- | -------------- | ---- |
| **Voice notes — transcription, replay, dedup, GC, caching** | `e32fa1c`, `dc6b030`, `2b6bb31`, `1ba5ac9`, `c8868f7`, `a0c16e1`, `a913366`, `8b72da7`, `d4cb804`, `6d30584`, `c7b7225` | `voice-notes/record-replay-delete.yaml`, `reports/voice-note-dedup.yaml` | Missing: transcribing-state visible immediately; multiple voice notes playback coordination (only one plays at a time); replay after playback finished (regression in `c8868f7`); cached playback (regression in `1ba5ac9`); GC of optimistic transcript map (`dc6b030`); voice-note id badge (`fc7b754`); voice note persists if screen unmounts mid-transcription (`d4cb804`); transcript visible beneath card (`c7b7225`). `voice-note-list` testID never asserted. |
| **Image performance — blurhash, two-stage lightbox, expo-image** | `b7aeed5`, `9ee72ac`, `77fed02`, `765197f`, `861a6a5` | _none_ | Need a flow that opens an image attachment, asserts placeholder/blurhash visible during load, then full image, then close. All `image-preview*`, `pdf-preview` testIDs uncovered. |
| **Camera capture + attachment picker (AppDialogSheet)** | `f7e8c43`, `c10b94d`, `d76ed51`, `162bff0` | `files/add-photo-cancel.yaml`, `files/add-document-cancel.yaml` | `btn-camera-capture`, `btn-attachment` never tapped. Need: open attachment sheet (AppDialogSheet), tap each option (camera / photo / document), cancel each, assert correct option labels. |
| **ConnectionBanner — multi-version (online/offline/safe-area/slide)** | `e6c4dda`, `a502380`, `c0a6ee6`, `e378fa1`, `b309028`, `3356da8` | `sync/offline-banner.yaml` (does not assert any `connection-banner-*` testID) | Need real offline trigger (in-app dev toggle — see Stage 1.5). Then: banner appears on every page (projects, project detail, report detail, report generate, profile); "Back online" message appears briefly on reconnect; safe-area inset honoured (visual snapshot, optional). |
| **Sync — pull report_notes, conflict resolution** | `049da0f`, `2e9d921`, `3894e0c`, `e5190a2`, `f24ac24`, `74ca87f`, `6ff73b6` | `sync/sign-out-cache-rehydrate.yaml` | All `conflict-banner`, `conflict-keep-mine`, `conflict-use-server`, `conflict-diff-toggle` testIDs uncovered — **no flow exercises conflict resolution**. Need: edit same report on two devices (two simulators, or sequential offline edits), reconnect, banner appears, both branches tappable. |
| **Optimistic draft creation + skeleton screens** | `18affb4`, `671c678`, `5d867af`, `9d578a8` | `reports/draft-resume.yaml` | Need: tap "New report" → assert draft screen appears within ~200ms (no full-screen spinner); skeleton visible while data loads; optimistic id replaced on commit. |
| **Progressive PDF export + preview + share** | `112b39f` | `reports/pdf-in-app-view.yaml`, `reports/save-pdf.yaml` | `pdf-preview`, `btn-pdf-open-externally` not asserted. Need: assert sheet feedback appears immediately; PDF viewer renders; "Open externally" launches share sheet. |
| **AppDialogSheet replaces Alert.alert (everywhere)** | `162bff0`, `d76ed51` | _partial_ | Need negative flows asserting that destructive confirms (`delete project`, `delete report`, `remove member`, `sign out`) all use `AppDialogSheet` (testID `dialog-sheet`), not the system alert. |
| **Profile — Clear cached data, voice-note id badge, single swipe-back** | `fc7b754`, `1bee7f9`, `2db0776` | 8 profile flows | `btn-clear-cache` never tapped. Need: tap → confirm dialog → assert cache cleared (e.g., usage chart goes empty). |
| **Soft-delete cascade (cloud fallback)** | `3894e0c`, `f84205a`, `6d23eb04`, `6d23eb04`, `6d23eb04` | _none directly_ | Need: delete a voice note → assert linked `report_notes` row also disappears from timeline; delete a report → notes hidden; restore via undo (if implemented). |
| **Color palette redesign** | `f3ff1ba`, `46d504e`, `a443c53`, `d910509` | _N/A_ | Visual only — out of Maestro scope unless we add screenshot diffs. |
| **Account / Usage / Onboarding screens** | (legacy, route uncovered) | `auth/onboarding-validation.yaml` only | `/account`, `/usage` routes never visited. `usage-empty-state` and `usage-populated.yaml` exists but doesn't navigate via the route literal. Add flow that taps `btn-open-usage` and `btn-open-account`. |

## Existing flows that need tightening (don't tap canonical testID)

These flows pass today but skip the `testID` selector, so the coverage
script flags them as uncovered. Fixing each is a 1–3 line edit.

| Flow | Missing testID assertion |
| ---- | ------------------------ |
| `members/add-member-*.yaml` (all) | `input-member-phone` |
| `profile/avatar-upload-cancel.yaml` | `btn-avatar-upload` |
| `auth/login-change-number.yaml` | `use-different-number`, `btn-login-change-number` |
| `projects/edit-save.yaml`, `edit-validation.yaml` | `input-edit-project-address`, `input-edit-client-name` |
| `projects/create-happy.yaml` | `btn-submit-project` (uses text "Create project") |
| `projects/overview-copy-buttons.yaml` | `btn-copy-client` (only `btn-copy-address` asserted) |
| `profile/account-details.yaml` | `profile-display-name`, `profile-phone`, `profile-company-name`, `build-info`, `server-info` |
| `auth/login-phone-otp.yaml` | `server-info` |
| `reports/*.yaml` | `screen-header-title` |
| `files/*.yaml` | `file-list`, `file-list-empty`, `file-list-loading`, `report-linked-files`, `report-files-loading` |

## Offline coverage — prerequisite work

Maestro cannot toggle airplane mode reliably on iOS sim, and `simctl`
lacks a clean network-off primitive. The chosen path is an **in-app dev
toggle** (see user decision in conversation):

- Add `forceOfflineMode` to `apps/mobile/lib/sync/SyncProvider.tsx`
  state, gated on `__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH`.
- Surface it in `app/profile.tsx` under a "Developer" section with
  `testID="btn-toggle-offline"` (visible-only-in-dev).
- Wrap `NetInfo.addEventListener` in `SyncProvider` so the toggle wins.
- Optional: also expose via deep-link `harpa://dev/offline` for
  scripted flows.

Once that exists, write these offline flows:

| Flow | Asserts |
| ---- | ------- |
| `sync/offline-create-project.yaml` | Toggle offline → create project → banner shows; toggle online → row eventually syncs (server `id` confirms persistence) |
| `sync/offline-add-note.yaml` | Open report → offline → type note → tap add → optimistic row appears → online → row keeps content, no error toast |
| `sync/offline-voice-note.yaml` | Offline → record → transcript queued state visible → online → transcript fills in |
| `sync/offline-finalize-blocked.yaml` | Offline → tap Finalize → assert error message ("You're offline" or similar); online → finalize succeeds |
| `sync/online-no-error-banner.yaml` | NEGATIVE: when online, `connection-banner-offline` is NEVER visible at any point in a 30s typical session |
| `sync/conflict-resolution.yaml` | Two-device or sequential-edit setup → reconnect → `conflict-banner` visible → tap `conflict-keep-mine` → diff toggle works |

## Error-message correctness

The user explicitly asked: assert that error banners/toasts:

1. **Show when they should** — covered partially by `negative` tagged flows.
2. **Do NOT show when they shouldn't** — currently only enforced in
   `report-create-and-delete.yaml` (per `docs/09-testing.md`). Add an
   `assertNotVisible` triple to every smoke flow:
   ```yaml
   - assertNotVisible: "Unexpected response format.*"
   - assertNotVisible: "Edge function.*"
   - assertNotVisible: "Something went wrong.*"
   ```
   This is a global subflow `subflows/assert-no-error.yaml` that every
   flow can `runFlow:` at its happy-path checkpoint.

## Proposed Stage 2 work breakdown

Each row is one PR-sized batch. I'll delegate authoring to subagents.

| # | Batch | New flows | Touches existing |
| - | ----- | --------- | ---------------- |
| 1 | Tighten existing flows to use canonical testIDs (move ~20 testIDs from uncovered → covered with no behavioural change) | 0 | ~12 |
| 2 | Camera/attachment + image lightbox (image perf) | 4 | 0 |
| 3 | Voice notes deep coverage (transcribing state, multi-card playback coord, replay-after-finish, cached playback, GC, badge, persist-on-unmount) | 6 | 1 |
| 4 | PDF + AppDialogSheet correctness | 3 | 2 |
| 5 | Profile depth (clear cache, account details, usage navigation) | 3 | 1 |
| 6 | **In-app `forceOffline` toggle** + 6 offline flows + global `assert-no-error` subflow | 6 | many |
| 7 | Conflict-resolution flow | 1 | 0 |
| 8 | Soft-delete cascade flow | 2 | 0 |

After all 8 batches the coverage script should clear 90% on both metrics.
