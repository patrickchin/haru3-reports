# Maestro coverage gaps

When we collapsed ~65 granular flows into 5 journeys
(`apps/mobile/.maestro/journeys/`), some uniquely-tested behaviors weren't
preserved verbatim. This is the inventory of *what we lost* so we can
re-add focused flows later if the underlying surface regresses.

Flows in `voice-notes/`, `files/`, and report note/voice/PDF flows
(`reports/note-*`, `reports/voice-note-*`, `reports/save-pdf.yaml`,
`reports/pdf-in-app-view.yaml`, `reports/new-report-*`,
`reports/report-soft-delete-hides-notes.yaml`) were **kept** because
parallel branches (`feat/media-pipeline`, `feat/voice-note-summary`)
are reworking those surfaces. They will be folded into the journeys
once those branches merge.

## Auth — gaps after `journeys/auth-and-onboarding.yaml`

- **`auth/login-otp-short-code.yaml`** — submitting a 3-character OTP.
  Journey only exercises a 6-character wrong code (000000). The short-
  code path tests client-side length validation specifically.
- **`auth/login-change-number.yaml`** — full assertion of
  `id: use-different-number` element. Journey checks
  `btn-login-change-number` only.
- **`auth/signup-phone-invalid.yaml`** — invalid phone-number formats on
  the signup stepper's phone step. Journey only tests the login-screen
  phone-too-short path. Signup-stepper phone validation is not exercised.
- **Onboarding happy path** — journey exercises the validation error,
  not the successful "Get Started" landing on Projects after filling
  the onboarding form. Covered indirectly by Mike/Sarah/Charlie deep-link
  logins which assume onboarding is already done.

## Projects — gaps after `journeys/projects-and-members.yaml`

None significant. All 10 project flows are subsumed.

## Members — gaps after `journeys/projects-and-members.yaml`

- **`members/list-owner-visible.yaml`** standalone smoke check on a fresh
  project. Journey covers the same assertion but inside a longer flow,
  so a regression in the owner-row rendering would surface only after
  Section C runs cleanly.

## Reports — gaps after `journeys/reports-lifecycle.yaml`

- **`reports/draft-delete.yaml`** — already a no-op (all-optional steps);
  drop without replacement.
- **Deletion of seed final-0/final-1**. The journey delete-cancels but
  never deletes the seeded finalized reports (those are perma-fixtures).
  We cover delete-confirm only on a freshly-finalized report. If the
  delete handler regresses for finalized reports, that path is still
  exercised — but only on the freshly-created one.

## Profile — gaps after `journeys/profile-and-settings.yaml`

- **`profile/avatar-upload-cancel.yaml`** — preserved (file-pipeline
  branch).
- **`profile/notifications-disabled.yaml`** — already a no-op-ish flow
  (mostly optional steps). Journey taps the row but doesn't specifically
  assert the `disabled` state on a fresh user.

## Cross-user — gaps after `journeys/cross-user-collaboration.yaml`

- **No verification that an Editor (Sarah) can create a draft report on
  Mike's project.** This is an RLS gap. Worth adding a focused flow
  later: as Sarah, on Collab Probe (or seeded Highland Tower), tap
  btn-new-report, add a note, generate, finalize, and confirm RLS lets
  the write through.
- **No verification that an Editor cannot delete the project**. The
  journey doesn't open the Edit screen as Sarah and confirm
  btn-delete-project is absent / disabled.
- **No verification that a Viewer (Mike on Sarah's Pacific Highway
  Upgrade per seed) is read-only.** Covered nowhere now.

## Files / voice-notes / PDFs

DEFERRED. All `apps/mobile/.maestro/files/`, `voice-notes/`, and
`reports/note-*` / `voice-note-*` / `*pdf*` flows are preserved on dev
and will be folded into the journeys once `feat/media-pipeline` and
`feat/voice-note-summary` merge. The latest `feat/voice-note-summary`
PR (#16, merged into dev as d2f62c4) added new UI surface that nothing
exercises yet:
- Voice-note title + summary above the player
- "Summarize" button + Sparkles icon when transcript > 400 chars
- "Summarizing..." spinner state
- Inline retry on failure
- Tap-to-toggle transcript reveal when summary is present

When the parallel branches merge, the cleanest plan is:
- A 6th journey `media-pipeline.yaml` covering photo capture / burst /
  upload-queue / lightbox / PDF view.
- A 7th journey `voice-notes.yaml` covering record / replay / transcribe
  / summarize / dedup / soft-delete cascade.

## What was deleted with no successor

These flows were either no-ops or fully redundant; nothing was preserved:
- `files/add-document-cancel.yaml` (no-op, all optional)
- `files/add-photo-cancel.yaml` (no-op, all optional)
- `files/image-preview-lightbox.yaml` (no-op, all optional;
  feat/media-pipeline rewrites it)
- `voice-notes/record-replay-delete.yaml` (no-op, all optional;
  feat/media-pipeline removes it)
- `reports/draft-delete.yaml` (no-op, all optional)
- `profile/notifications-disabled.yaml` (mostly optional; subsumed
  shallowly)
