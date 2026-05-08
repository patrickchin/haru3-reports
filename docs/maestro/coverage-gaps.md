# Maestro coverage gaps

The Maestro suite is structured as:

- **1 main journey** (`journeys/core-end-to-end.yaml`) — covers the
  critical path in one trip. If this passes, the core pipeline survived
  the day's commits.
- **3 small journeys** (auth-and-onboarding, cross-user-rls,
  profile-settings) — surfaces that can't fit into the main flow
  (logged-out states, two personas, profile back-nav regressions).
- **Granular flows** in `files/`, `voice-notes/`, `reports/`,
  `profile/`, `camera/` — the regression net for known bugs. Each runs
  once per CI/release.

This document records gaps in the journey-suite coverage that the
granular flows do (or do not) backstop.

## Journey 1 (`core-end-to-end.yaml`) coverage

Covers in a single happy-path session:

- Auth: deep-link login as Mike
- Project create + member add (Sarah Editor) + project delete
- Report draft create + text note + voice note (mocked) + auto-summary
- Upload queue: in-app camera (1 photo) + photo library pick (1 photo)
- Timeline coexistence: text + voice card + 2 photo file cards
- Lightbox open/close
- AI generate (fixture LLM, "sunny" assertion)
- Edit tab autosave indicator
- Finalize report
- PDF view (in-app preview)
- PDF save (success modal)
- Report delete + project delete

Run as smoke test:
```
maestro test --include-tags=core apps/mobile/.maestro/journeys/
```

## Negative / validation cases NOT in Journey 1

Journey 1 is strict happy-path. The following are covered elsewhere:

- **Login validation negatives** (short phone, wrong OTP, change-number
  flow) — `journeys/auth-and-onboarding.yaml`
- **Signup stepper validation** — `journeys/auth-and-onboarding.yaml`
- **Onboarding validation** — `journeys/auth-and-onboarding.yaml`
- **Empty project name validation** — NOT covered. Was in the old
  `projects-and-members.yaml` journey. Add a granular flow if this
  regresses.
- **Empty / invalid member phone validation** — NOT covered. Was in the
  old `projects-and-members.yaml` journey.
- **Empty draft cannot finalize** — `reports/new-report-empty-note.yaml`
- **Photo upload cancel / discard pending** —
  `files/photo-upload-discard-pending.yaml`
- **Camera permission denied** — `camera/camera-permission-denied.yaml`
  (tagged `wip` until permission staging is reliable)

## Read-side RLS / cross-user

- **Editor can read but cannot delete** — `cross-user-rls.yaml` confirms
  the read side. The negative (Editor sees no delete button) is **not**
  asserted yet. Add if needed.
- **Viewer (Mike on Sarah's Pacific Highway per seed)** — not exercised.

## Recurring back-navigation regressions

- **Single-back from profile -> Projects** —
  `journeys/profile-settings.yaml` Section A
- **Back-from-deep-screen** (project detail -> profile -> back stays on
  project) — `journeys/profile-settings.yaml` Section E
- **5x repeated profile<->Projects toggle** — NOT in journey suite.
  Delete-able regression test if the underlying intermittent bug
  resurfaces.

## Granular flow inventory (the regression net)

### `files/` (8 flows)
- `photo-upload-completes` — happy path, single shot
- `photo-upload-burst-completes` — multi-photo burst (last-photo-wins
  regression)
- `photo-upload-discard-pending` — cancel mid-flight
- `photo-library-pick-completes` — system picker path
- `image-preview-lightbox` — picker -> upload -> lightbox open/close
- `ios-background-upload-completes` (wip, ios-only)
- `android-upload-foreground-notification` (android-only)
- `queue-persists-after-relaunch` — process kill mid-upload

### `voice-notes/` (6 flows)
- `record-replay-delete` — happy path + auto-summary contract
- `replay-after-finish` — player not stuck after one playback
- `playback-coordination` — only one card plays at a time
- `persist-on-unmount` — leaving screen mid-transcribe doesn't lose row
- `id-badge` — every card shows tappable id badge
- `cached-playback` — second playback uses cache, no "Loading"

### `reports/` (9 flows)
- `new-report-empty-note` — negative: no notes -> no finalize
- `new-report-fixture-happy` — generation smoke
- `note-add-and-remove` — text note add (remove not asserted)
- `note-timeline-order` — multiple notes coexist (skip-release)
- `voice-note-dedup` — single voice note != 3 timeline rows
- `voice-note-soft-delete-cascade` — DB cascade regression
- `report-soft-delete-hides-notes` — draft delete clears reports list
- `save-pdf` — PDF save success modal
- `pdf-in-app-view` — `pdf-preview` modal renders

### `profile/` (1 flow)
- `avatar-upload-cancel` — picker opens + dismisses (skip-release)

### `camera/` (2 flows)
- `camera-happy-path` — chrome controls, multi-shot, done
- `camera-permission-denied` — empty state when permission revoked
  (wip)

## Things to add later (low priority)

- **Editor cannot delete someone else's project** (RLS negative)
- **Viewer cannot create reports** (RLS negative on Mike-on-Sarah's seed)
- **Document attachment upload happy path** — feature exists but no
  granular coverage yet
- **Repeated 5x profile back-cycle** — remove from profile-settings
  journey but add as granular if the underlying bug reappears
