# Mobile v2 — E2E Parity Status

**Refreshed:** 2026-05-10. Branch: `mobile-v2`. tsc: **0 errors**.

The full v1 Maestro suite (47 yaml flows) is mirrored at
[apps/mobile-v2/.maestro/](../.maestro/). Every testID it references is
emitted by a v2 component or by the centralized registry in
[src/infra/test-ids.ts](../src/infra/test-ids.ts).

## Wave-by-wave coverage

| Wave | Area | Status |
|---|---|---|
| Phase 0 + I | Auth (signup stepper, OTP change-number, e2e-login) | ✅ |
| I | Projects (`input-client-name`, project rows) | ✅ |
| I | Camera (flash toggle, photo count, capture/flip/done) | ✅ |
| K | Voice notes (record/playback/transcript/options/delete; `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE`) | ✅ |
| L | Uploads (attachment sheet, pending rows, queue hydrate, file rows) | ✅ |
| L → N | Camera→queue auto-enqueue (session registry handoff) | ✅ |
| L → N | Image lightbox with signed-URL fetch | ✅ |
| M | Reports (AI generate, finalize, view/save/share PDF, in-report delete, edit sections) | ✅ |
| M | Usage data (summary tokens + monthly history) | ✅ |
| O | Android foreground-service notification (Notifee) | ✅ |
| O | iOS NSURLSession background upload | ⚠️ stubbed (foreground-only; `expo-file-system/legacy` background session deferred) |
| P | Avatar upload (picker → 512×512 downscale → `avatars` bucket) | ✅ |
| P | Pre-existing tsc errors | ✅ all 3 fixed |
| Q + draft-menu | testID audit + `btn-draft-menu` / `voice-note-transcript-modal-*` / `dialog-action-voice-note-view-transcript-*` / `dialog-action-voice-note-transcript-close-*` | ✅ |

## Known residuals (real, not testID-only)

1. **iOS true background upload completion**
   - File: [src/features/uploads/ios-background-upload.ts](../src/features/uploads/ios-background-upload.ts) returns `undefined`.
   - Effect: uploads only progress while the app is foreground. Queue
     persistence + rehydration on next launch still works.
   - Maestro: `files/ios-background-upload-completes.yaml` exercises the
     rehydration path, which does work; full backgrounded completion needs
     the NSURLSession handoff. v1 implementation is small (~60 LOC) — port
     when a real device test is available.

2. **Notifee foreground-service swipe-kill**
   - On Android, swipe-killing the app drops the foreground service
     notification. v1 has the same behavior; not a v2 regression.

3. **Avatar upload UX**
   - v2 ports v1's `expo-image-picker` flow exactly. The
     `avatar-upload-cancel.yaml` flow asserts cancel-keeps-existing, which
     is the picker's default and works.

## Verification commands

```bash
# typecheck (must be 0)
pnpm --filter mobile-v2 exec tsc --noEmit

# unit tests
pnpm --filter mobile-v2 exec vitest run

# E2E (requires simulator + local supabase with USE_FIXTURES=true)
pnpm --filter mobile-v2 ios:mock           # build + install fixture-mode app
cd apps/mobile-v2 && maestro test .maestro/   # full suite

# Spot-check critical flows
maestro test .maestro/journeys/auth-and-onboarding.yaml
maestro test .maestro/journeys/core-end-to-end.yaml
maestro test .maestro/reports/report-soft-delete-hides-notes.yaml
maestro test .maestro/voice-notes/record-replay-delete.yaml
```

## Inventory

- **Unique maestro testIDs referenced:** 112 (literal + regex patterns).
- **v2 registry strings:** 125+ (registry plus dynamic id-keyed functions).
- **Diff after Wave Q + draft-menu fix:** all required ids are emitted by
  components; the remaining `comm` differences are all dynamic-id
  prefixes (e.g. `voice-note-card-` ← `voiceNotes.card(file.id)`),
  which Maestro matches via `.*` regex at runtime.

The next failure surface is real-device behavior (audio permissions,
storage signed-URL TTLs, expo-print PDF rendering, notifee
notifications), discoverable only by running the suite on a simulator
and a device.
