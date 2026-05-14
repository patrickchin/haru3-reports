# E2E Test Plan (Maestro)

> **Scope**: end-to-end UI testing for the HarpaPro mobile app via Maestro
> 2.3 against the iOS simulator and (where flagged) Android emulators.
> This document complements:
>
> - [coverage-gaps.md](coverage-gaps.md) — the per-flow gap inventory
> - [login-troubleshooting.md](login-troubleshooting.md) — auth fixture pitfalls
> - [09-testing.md](../09-testing.md) — overall testing strategy
>
> Last revised 2026-05-09. Owner: mobile platform team.

---

## 1. Goals & non-goals

### Goals
1. **Catch release-blocking regressions before merge to dev.** Every PR
   that touches `apps/mobile`, `packages/report-core`, `supabase/migrations`,
   or `supabase/functions` must run the smoke layer.
2. **Backstop known historical bugs.** Each granular flow exists because
   a bug shipped at least once. Removing one requires the bug to be
   replaced with a unit / integration test of equal or higher signal.
3. **Verify cross-cutting contracts that unit tests can't.** RLS enforcement
   from the client's perspective, queue ordering across navigation,
   permission prompts, deep links.
4. **Stay under a 12-minute wall-clock budget for the smoke layer** on
   local hardware (M-series Mac, single sim) so devs run it before push.

### Non-goals
- 100% UI coverage. The unit + integration suite (vitest, RTL) is the
  primary safety net; Maestro is the integration sanity check.
- Visual regression. Screenshots are kept for debugging only — no pixel
  diffing.
- Performance benchmarking. Use Reassure / Flashlight for that.
- Cross-locale / RTL / accessibility audits. Tracked separately.

---

## 2. Suite topology

The suite is layered. Each layer has a clear "if this fails, X is broken"
contract.

```
Layer                     Run when                          Wall-clock
────────────────────────  ────────────────────────────────  ───────────
1. Smoke      (1 flow)    every PR, every push to dev       ~3 min
2. Journeys   (3 flows)   nightly + before release tag      ~8 min
3. Granular   (~30 flows) nightly + ad-hoc bug repro        ~30 min
4. Coverage gate          pre-merge                         <5 sec
```

### Layer 1 — Smoke (`journey + core` tag)
Single happy-path session through the must-survive pipeline:
auth → project CRUD → member add → draft → text + voice + photo + camera →
generate → finalize → PDF → cleanup.

File: [`journeys/core-end-to-end.yaml`](../../apps/mobile/.maestro/journeys/core-end-to-end.yaml)

If smoke is red, **dev is broken**. No merges until green.

### Layer 2 — Journeys (`journey` tag)
Surfaces that don't fit cleanly into a single happy-path session:

- [`journeys/auth-and-onboarding.yaml`](../../apps/mobile/.maestro/journeys/auth-and-onboarding.yaml)
  — logged-out surface, OTP errors, signup stepper validation, sign-out.
- [`journeys/cross-user-rls.yaml`](../../apps/mobile/.maestro/journeys/cross-user-rls.yaml)
  — Mike↔Sarah membership add/remove visibility (over real RLS).
- [`journeys/profile-settings.yaml`](../../apps/mobile/.maestro/journeys/profile-settings.yaml)
  — back-nav regressions, AI model picker, themed dialogs.

Run with:
```
maestro test --include-tags=journey apps/mobile/.maestro/
```

### Layer 3 — Granular (`files/`, `voice-notes/`, `reports/`, `profile/`,
`camera/`, `members/`, `projects/`)
The historical regression net. Each file maps 1:1 to a previously-shipped
bug. New files in this layer require a one-line comment at the top
explaining the bug they backstop.

### Layer 4 — Coverage gate
[`scripts/coverage.mjs`](../../apps/mobile/.maestro/scripts/coverage.mjs)
is a static analysis pass: every `app/**/*.tsx` route and every declared
`testID` must be referenced by at least one flow. Defaults: 90% routes,
90% testIDs. CI-gated.

---

## 3. Tag taxonomy

Tags are the only knob CI uses to slice the suite. Keep the set small.

| Tag             | Meaning                                                         |
|-----------------|-----------------------------------------------------------------|
| `core`          | Belongs to the smoke layer. Exactly one flow today.             |
| `journey`       | Belongs to the multi-section journey layer.                     |
| `auth`          | Touches login / signup / onboarding surface.                    |
| `rls`           | Asserts RLS over the wire (requires running Supabase).          |
| `cross-user`    | Switches users mid-flow (slow; needs deep-link login).          |
| `profile`       | Profile / settings screens.                                     |
| `skip-release`  | Excluded from the Release-config CI run (dev-only deps).        |
| `wip`           | Known-flaky / in-progress; never enforced by CI.                |
| `ios-only`      | Skipped on Android.                                             |
| `android-only`  | Skipped on iOS.                                                 |

CI run shapes:
```
PR (Release):       --include-tags=core --exclude-tags=wip
Nightly (Release):  --include-tags=core,journey --exclude-tags=skip-release,wip
Nightly (Debug):    --exclude-tags=wip
```

---

## 4. Authoring conventions

### 4.1 Selectors
- **Prefer testIDs** over text. Text-based selectors break on copy changes
  and i18n.
- testIDs are **kebab-case-with-purpose-prefix**:
  - `btn-*` for tappable buttons (`btn-add-note`)
  - `input-*` for inputs (`input-member-phone`)
  - `screen-*` for whole-screen markers (`screen-onboarding`)
  - `dialog-*` for sheets (`dialog-sheet`, `dialog-action-0`)
  - `*-row-*` for list rows (`project-row-0`)
- Dynamic IDs use a stable suffix pattern with regex:
  `voice-note-transcript-.*`, `btn-open-file-.*`.

### 4.2 Waits
- **No raw `wait`**. Use `extendedWaitUntil` with an explicit timeout.
- Default timeouts:
  - 5 s for in-screen UI (mounted, animation done)
  - 15 s for navigation + first paint
  - 30 s for network round-trips (uploads, queue settle, RLS refetch)
  - 60 s only for AI generation (fixture LLM)
- After every `tapOn` that triggers navigation, follow with
  `waitForAnimationToEnd` *and* an `extendedWaitUntil` on the destination
  marker.

### 4.3 Subflows
Live under `subflows/`. They:
- Take parameters via `env:` blocks (no global state).
- Run silently — no `assertVisible` unless asserting their own contract
  (e.g. `assert-no-error.yaml`).
- Are composed by journeys. Granular flows can use them too but should
  prefer inline steps so the failure points to the actual regression.

### 4.4 Negative assertions
- `assertNotVisible:` only after the negative state has had time to settle.
  Combine with an `extendedWaitUntil { notVisible: ... }` when waiting
  *for* something to disappear.
- `assert-no-error.yaml` is the catch-all "no toast / banner / RN red box"
  check. Run it at the end of every journey.

### 4.5 Optional steps
Use `optional: true` for steps that may or may not appear (system
permission prompts, Android-only confirms, animations that race the
camera). **Do not** use `optional: true` to paper over a flaky assertion
— if it's optional, it's not testing anything.

---

## 5. Fixtures & environments

### 5.1 App build flags
| Flag                                      | Purpose                                  |
|-------------------------------------------|------------------------------------------|
| `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true`    | Mocks expo-audio so voice-note flows are deterministic on simulator. |
| `EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true`  | Exposes `/e2e/login` deep-link route.    |
| `USE_FIXTURES=true` (edge-fn env)         | Routes LLM/transcribe/summarize to deterministic fixtures. |

The Release-config build defaults to `USE_FIXTURES=false`; the e2e
release build is `pnpm ios:mock:release` which sets the voice-note flag
and points the app at fixture-mode functions.

### 5.2 Database
- `supabase db reset` reseeds from
  [`supabase/seed.sql`](../../supabase/seed.sql) (Mike, Sarah, Charlie,
  Highland Tower, Pacific Highway).
- Each journey/granular flow assumes a freshly-seeded DB on first run,
  but **must clean up after itself** (`delete-current-project`,
  `report-delete`) so it can be re-run without a reset.

### 5.3 Edge functions
- `supabase functions serve --env-file supabase/.env.fixtures
  --no-verify-jwt` runs locally on :54321.
- `.env.fixtures` is committed (no secrets — fixtures only).

### 5.4 Simulator state
- Permissions (camera, photo library, mic) must be pre-granted via
  `xcrun simctl privacy ... grant` before suite start. The
  `camera-permission-denied.yaml` flow is the only one that revokes.
- Sim language = `en_US`, region = `US`, font scale = default.

---

## 6. CI integration

### 6.1 Local pre-push (developer)
`.githooks/pre-push` runs:
1. `pnpm -F mobile lint && pnpm -F mobile typecheck`
2. `pnpm -F mobile test` (vitest)
3. **Smoke** maestro flow (only if iOS sim already booted; otherwise skip
   with warning).

### 6.2 GitHub Actions
| Workflow             | Trigger             | Layers                                |
|----------------------|---------------------|---------------------------------------|
| `pr-mobile.yml`      | PR touching mobile  | unit + smoke + coverage gate          |
| `nightly-mobile.yml` | cron 04:00 UTC      | unit + journeys + granular + coverage |
| `release-mobile.yml` | tag `mobile-v*`     | unit + journeys (Release) + granular  |

Failures upload:
- `~/.maestro/tests/<run-id>/` (screenshots, logs)
- Crash `.ips` from `~/Library/Logs/DiagnosticReports/`
- `supabase logs functions` tail

### 6.3 Maestro Cloud
`MAESTRO_CLOUD_API_KEY` is wired via Doppler; nightly mirrors the local
journey layer to Maestro Cloud for cross-device matrix coverage (iOS 17,
18, 26 + Pixel 7). Failures are advisory, not gating, until flake budget
proves stable.

---

## 7. Flake mitigation

### 7.1 Causes we've actually seen
1. **Race between `tapOn` and animation start** — fixed by always pairing
   navigation taps with `waitForAnimationToEnd`.
2. **Metro bundler cold-cache** — fixed by warming the bundle once
   before suite start in CI.
3. **Sim clock drift on long runs** — fixed by `xcrun simctl boot ...
   --booted` and `xcrun simctl io booted setNetworkLink` reset between
   journeys.
4. **expo-audio TurboModule SIGABRT** — fixed in `da13499` by guarding
   `crypto.randomUUID`. If you see `objc_exception_rethrow` →
   `ObjCTurboModule::performVoidMethodInvocation` again, suspect a new
   native module that lacks the safe-uuid pattern.
5. **Auth deep link not consumed** — see
   [login-troubleshooting.md](login-troubleshooting.md). The fix is to
   wait for `Projects` *after* `openLink:`, not before.
6. **Photo permission dialog** — system prompts are racy; the suite
   pre-grants via `xcrun simctl privacy` and uses `optional: true` on
   the inline allow-button as a belt-and-braces.

### 7.2 Quarantine policy
A flow that fails twice in a week without a code-side cause gets the
`wip` tag, a tracking issue, and 7 days to be either fixed or deleted.
Quarantined flows are excluded from `core`/`journey` runs.

---

## 8. Coverage strategy

### 8.1 What `coverage.mjs` measures
- **Route coverage**: every file in `app/**` (excluding layouts and
  `+not-found`) must be visited by at least one flow.
- **testID coverage**: every `testID="..."` literal in
  `app|components|hooks|lib` must be referenced by at least one flow.

### 8.2 Current state (2026-05-09)
- Route coverage 93.8% (1 uncovered: `/usage`)
- testID coverage 88.8% (11 uncovered, listed below)

### 8.3 Action items to reach 95% / 95%
| Gap                                | Fix                                                  |
|------------------------------------|------------------------------------------------------|
| `/usage` route + `screen-usage`    | Add a granular `profile/usage-screen.yaml` (open profile → Usage). |
| `btn-open-usage`                   | Same flow.                                           |
| `btn-edit-manually` (generate.tsx) | Add to `reports/note-add-and-remove.yaml` after note creation. |
| `btn-report-share-pdf`             | Extend `reports/save-pdf.yaml` to assert share button visible. |
| `e2e-login-{screen,error,status}`  | Add `auth/deep-link-error.yaml` invoking `harpa://e2e/login?demo=invalid`. |
| `file-list-loading`, `report-files-loading` | Throttle simulator network in `files/*-loading.yaml`. |
| `image-preview-{loading,placeholder}` | Same approach in `files/image-preview-lightbox.yaml`. |

---

## 9. Backlog (mapped to coverage-gaps.md)

Priority order. Items below the line are nice-to-haves.

| #  | Item                                                                  | Layer       |
|----|-----------------------------------------------------------------------|-------------|
| 1  | Editor cannot delete (RLS negative)                                   | granular    |
| 2  | Viewer cannot create reports (RLS negative on Sarah-on-Mike's seed)   | journey     |
| 3  | Empty project name validation                                         | granular    |
| 4  | Empty / invalid member phone validation                               | granular    |
| 5  | Document attachment upload happy path                                 | granular    |
| 6  | Voice-note title-only (short) vs title+summary (long) divergence      | granular    |
| 7  | Generate retry on Edge-fn 500                                         | granular    |
| 8  | Network-offline banner + queued upload resume                         | granular    |
| 9  | Background-upload completion across app foreground/background         | granular    |
| 10 | Report soft-delete restores from Trash (when feature lands)           | granular    |
| ── | ─────────────────────────────────────────────────────────────────── | ─────────── |
| 11 | Repeated 5x profile back-cycle (only if regression resurfaces)        | granular    |
| 12 | Pull-to-refresh on Projects                                           | granular    |
| 13 | Locale switch (en → zh) sanity                                        | granular    |

---

## 10. What "good" looks like

A healthy E2E suite for this codebase has:

1. **Smoke runs in <4 min** on a warm M-series Mac, with a single
   command. Devs actually run it.
2. **Journeys run in <10 min** and the diff between nightly green/red
   is one suspect commit ~80% of the time.
3. **Granular failures point at code, not test.** When a granular flow
   goes red, the linked bug is either back or the test is stale —
   never "Maestro flake."
4. **Coverage report is part of the PR view.** Every PR shows the
   route/testID delta vs main. Drops are explained or fixed.
5. **No evergreen `wip` tags.** Quarantine has a clock; a `wip` flow
   either gets fixed or deleted within a week.
6. **Subflows are thin and parameterized.** A new persona is a new
   subflow file, not a forked journey.
7. **Fixtures are deterministic.** "sunny" appears in the AI report
   every time, every machine, every clock. If a fixture is non-
   deterministic, the test will be too.
8. **Failures are debuggable in <5 min.** Screenshots + the last 200
   lines of `supabase logs functions` + the .ips crash are enough to
   localize 90% of issues.

---

## 11. Open questions / future work

- **Android matrix.** Only `android-upload-foreground-notification` is
  Android-tagged today. Either expand to a parallel Android suite or
  excise the tag taxonomy.
- **Maestro Cloud cost vs signal.** Currently advisory; decide by Q3
  2026 whether to gate on it.
- **Detox vs Maestro.** Maestro's lack of in-process JS makes some
  assertions awkward (querying React state). If we hit a wall, evaluate
  a partial Detox layer for hook-level assertions.
- **Snapshot management.** Long-running suites generate ~200 MB of
  screenshots. Decide retention policy (current: 30 days in CI artifact
  storage).

---

## 12. Quick-reference commands

```sh
# Pre-flight: clean DB + seed + functions + sim build
cd /Users/<you>/Workspace/.../haru3-reports
supabase start
supabase db reset
nohup supabase functions serve --env-file supabase/.env.fixtures \
  --no-verify-jwt > /tmp/fns.log 2>&1 &
cd apps/mobile && pnpm ios:mock:release

# Smoke (PR-equivalent)
maestro test --include-tags=core .maestro/

# Journeys (nightly-equivalent)
maestro test --include-tags=journey --exclude-tags=skip-release,wip .maestro/

# Full suite
maestro test --exclude-tags=skip-release,wip .maestro/

# Single flow
maestro test .maestro/voice-notes/record-replay-delete.yaml

# Coverage gate
node .maestro/scripts/coverage.mjs
```
