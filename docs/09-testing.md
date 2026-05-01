# Testing

This repo has four test layers. Each one catches a different class of bug —
they are not redundant. Always start at the lowest layer that can express the
failure.

| Layer | Tooling | Lives in | What it catches |
|---|---|---|---|
| Unit (mobile) | Vitest, mocked Supabase | `apps/mobile/**/*.test.{ts,tsx}` | Client logic, validators, UI state |
| Unit (edge fns) | `deno test` | `supabase/functions/<name>/*test*.ts` | Edge-function pure logic |
| RLS integration | Vitest + real Postgres | `supabase/tests/*.test.ts` | RLS policies, triggers, SQL functions |
| Maestro E2E | Maestro | `apps/mobile/.maestro/` | Full user journey including the LLM call |

LLM calls are mocked everywhere except the Deno integration suite (CI-only,
real provider) and the default Maestro setup. For local Maestro runs see
[Local E2E](#local-e2e-fixtures) below — fixtures captured from real LLM
output let the whole stack run offline.

## Quick reference

```bash
# Everything except E2E
pnpm test

# Mobile unit only
pnpm test:mobile

# Mobile OTA export check (mirrors the EAS Update bundling step)
pnpm build:mobile:update

# Edge function unit (per function)
cd supabase/functions/<name> && deno test -A

# RLS – local stack (Docker)
pnpm test:rls:local
SKIP_RESET=1 pnpm test:rls:local        # keep current local data

# RLS – hosted dev project
pnpm test:rls:hosted

# Maestro E2E – local fixtures (no LLM tokens, no hosted Supabase)
pnpm test:e2e:local

# Maestro E2E – live (calls real LLM, see "Maestro E2E" below)
cd apps/mobile && maestro test .maestro/

# LLM fixtures
pnpm fixtures:check              # warn if SYSTEM_PROMPT diverged from snapshots
pnpm fixtures:rebuild-parsed     # refresh *.parsed.json from existing raw.txt
pnpm fixtures:capture            # call the real LLM and refresh all fixtures
```

## Pre-push hook

The repo uses native Git hooks from `.githooks/`. `pnpm install` runs the
root `prepare` script, which sets `core.hooksPath=.githooks` unless a custom
hooks path is already configured.

The pre-push hook runs the mobile unit suite and the OTA export check:

```bash
pnpm test:mobile
pnpm build:mobile:update
```

To intentionally bypass local hooks for a push, use:

```bash
git push --no-verify
```

For local-only automation that still invokes `git push` normally, this hook
also honors:

```bash
SKIP_PRE_PUSH_CHECKS=1 git push
```

`SKIP_PRE_PUSH_TESTS=1` is also accepted for compatibility with older local
aliases.

## 1. Unit — mobile

Vitest with React Native mocks. Supabase is mocked; **RLS is not exercised
here**. Use unit tests for pure functions, payload normalizers, hooks with
mocked I/O, and form validation.

Do not place `*.test.ts` or `*.test.tsx` files under `apps/mobile/app/`.
Expo Router treats that directory as the route tree, and OTA export can bundle
route-adjacent tests into the app. Put screen-level tests in
`apps/mobile/__tests__/` instead.

Examples worth modelling:

- [`apps/mobile/lib/generated-report.test.ts`](../apps/mobile/lib/generated-report.test.ts) — boundary
  validation of edge-function payload shapes.
- [`apps/mobile/lib/auth-security.test.ts`](../apps/mobile/lib/auth-security.test.ts) — pure logic with
  no React tree.

Coverage target: 80%+ for non-trivial files. Skip trivial wrappers.

## 2. Unit — edge functions

Deno-native tests live next to each function. Mock the Supabase client and
LLM SDKs at the boundary. Run them per-function:

```bash
cd supabase/functions/generate-report && deno test -A
cd supabase/functions/transcribe-audio && deno test -A
cd supabase/functions/summarize-voice-note && deno test -A
```

CI runs them via `.github/workflows/edge-function-tests.yml`.

## 3. RLS integration

The only place where **real PostgreSQL policies** actually run. See
[`supabase/tests/README.md`](../supabase/tests/README.md) for the full
contract; in summary:

- Local mode (`pnpm test:rls:local`) spins up `supabase start`, runs
  `supabase db reset` to re-apply migrations + `seed.sql`, then runs the
  suite. Isolated and fast.
- Hosted mode (`pnpm test:rls:hosted`) targets the dev Supabase project for
  drift detection. Uses seeded users `mike@example.com` / `sarah@example.com`
  with password `test1234`. Each suite cleans up its own rows in `afterAll`.

Add a new RLS test whenever you write a policy, trigger, or SQL function —
mocked unit tests cannot catch RLS bugs.

## 4. Maestro E2E

End-to-end flows drive the real iOS / Android app against the developer's
configured Supabase. They cost real LLM tokens (cents per run) — keep them
short and self-contained.

### Prerequisites

```bash
# Java 17 (Maestro requires it)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Build and install the app

Maestro drives a real installed binary. Two options:

**Release build for local E2E (recommended — zero seed, fixtures):**

```bash
cd apps/mobile
EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true \
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=$(supabase status -o env | awk -F= '/^ANON_KEY=/{gsub(/"/,"",$2);print $2}') \
  pnpm exec expo run:ios --configuration Release
```

The binary must point at the local Supabase URL. All flows use phone-OTP
login (not demo accounts) against a zero-seed DB with test OTP codes in
`supabase/config.toml`.

> **Known issue.** After a successful Release build, `@expo/cli` can crash
> with `DOMParser.parseFromString: the provided mimeType "undefined" is not
> valid`. The build itself succeeded — install + launch manually:
>
> ```bash
> UDID=74BD91D6-A305-4B59-BBF5-F43BFC07B7F2   # iPhone 16, iOS 18.3
> APP=~/Library/Developer/Xcode/DerivedData/HarpaPro-*/Build/Products/Release-iphonesimulator/HarpaPro.app
> xcrun simctl uninstall "$UDID" com.harpa.pro
> xcrun simctl install "$UDID" $APP
> xcrun simctl launch "$UDID" com.harpa.pro
> ```

**Debug build with Metro (for fast JS iteration):**

```bash
cd apps/mobile
EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true pnpm exec expo start --dev-client
```

`subflows/ensure-logged-out.yaml` already handles the expo-dev-client
launcher — it taps the discovered `Harpa Pro` Metro entry when
`"Development Build"` is visible, and skips the branch on Release builds.

### Pushing JS-only changes without a full rebuild

If you only changed JS/TS, you don't need to rebuild the native app — just
re-bundle the JS into the existing `.app` and reinstall:

```bash
cd apps/mobile
APP=~/Library/Developer/Xcode/DerivedData/HarpaPro-*/Build/Products/Release-iphonesimulator/HarpaPro.app
EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true npx expo export:embed \
  --platform ios --dev false \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output "$APP/main.jsbundle" \
  --assets-dest "$APP"
xcrun simctl terminate $UDID com.harpa.pro 2>/dev/null
xcrun simctl install   $UDID "$APP"
xcrun simctl launch    $UDID com.harpa.pro
```

The `--entry-file` must be `node_modules/expo-router/entry.js` (the value of
`apps/mobile/package.json`'s `main` field). Using `index.ts` directly will
bundle the placeholder template.

### Running flows

```bash
cd apps/mobile

# Run every flow
maestro test .maestro/

# Run a single flow
maestro test .maestro/auth/login-phone-otp.yaml

# Run flows by tag
maestro test --tags=smoke .maestro/
maestro test --tags=auth .maestro/
maestro test --tags=negative .maestro/

# Interactive UI inspector
maestro studio

# Read the live view hierarchy (handy for finding hidden text behind the
# keyboard or under banners)
maestro hierarchy | grep -oE '"accessibilityText"[^,]*' | sort -u
```

Failures dump artifacts to `~/.maestro/tests/<timestamp>/` — the
screenshot, view hierarchy, command log, and AI report are all worth
checking before tweaking selectors.

### Voice-note flows

Maestro can tap the voice-record controls, but it does not provide a
microphone-audio injection path comparable to `addMedia` for gallery files.
`addMedia` only supports images and MP4 videos, not audio inputs.

For local voice-note Maestro runs, build or re-bundle the app with:

```bash
# from anywhere in the repo
pnpm ios:mock                 # debug build, simulator recorder stubbed
pnpm ios:mock:release         # release build (matches CI / Maestro)

# or set the flag manually
EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true npx expo run:ios
```

That flag stubs the iOS-simulator recorder only — it writes a tiny
placeholder audio file in place of mic input. The `transcribe-audio` edge
call still goes through auth + network normally; the transcript itself is
mocked **server-side** by running `supabase functions serve` with
`USE_FIXTURES=true` (same flag that mocks the LLM in `generate-report`).
The voice note continues through the normal `recordVoiceNote` upload and
`file_metadata` persistence flow, so timeline / dedup regressions are still
exercised.

Add `--device "<name-or-udid>"` to target a specific simulator/device,
e.g. `pnpm ios:mock -- --device "iPhone 15 Pro"`.

That flag makes the app's `useSpeechToText` hook keep the real
`btn-record-start` / `btn-record-stop` UI path while writing a tiny temp
audio file in place of mic input. The transcribe-audio edge call still
runs normally — the transcript is mocked by the edge function under
`USE_FIXTURES=true`.

### Authoring rules

- **Prefer `testID` selectors over text.** Text matching is brittle in
  dynamic lists with duplicates. New scrollable rows should expose
  `project-row-${index}` style IDs; the newest row is always at index 0.
- **Use subflows in `.maestro/subflows/`** for setup. Login goes through
  `signup-or-login-mike.yaml` (phone OTP) so flows run reliably from any
  starting state. All subflows use fixed test OTP `888888`.
- **Fast-fail on real bugs.** If the UI shows a known error banner, assert
  it is *not* visible *before* waiting on the success state — otherwise
  every regression looks like a flaky timeout. Example from
  `report-create-and-delete.yaml`:

  ```yaml
  - assertNotVisible: "Unexpected response format.*"
  - assertNotVisible: "Edge function.*"
  - extendedWaitUntil:
      visible:
        id: "btn-finalize-report"
      timeout: 180000
  ```

- **Self-contained over seeded.** Flows that depend on `seed.sql` data are
  fragile against the user's live Supabase. Where practical, create the
  fixture (project, report) inside the flow and delete it at the end.
- **`hideKeyboard` only when a keyboard is up.** It fails the flow
  otherwise — gate it on a `runFlow when:` check, or dismiss by tapping a
  non-interactive element such as the tab title.
- **Watch the LLM budget.** Real `generate-report` calls take 10–30s and
  cost cents. Use a typed note rich enough to populate every section so a
  single run covers weather / workers / materials / issues.

### Cloud journeys

`apps/mobile/.maestro/cloud/journey.yaml` is a single linear flow that
covers as many screens as possible in one run. Maestro Cloud bills per
flow run, so we batch into one journey instead of dozens of separate
flows. The local `*.yaml` flows remain the canonical source of truth —
update both when changing a section.

Set `MAESTRO_CLOUD_API_KEY` in the repo-root `.env` to use Maestro Cloud
locally; the file is gitignored.

### Tags

Every flow is tagged by feature area and test type. Use tags for selective
runs:

| Feature tag | Area |
|---|---|
| `auth` | Login, signup, onboarding, sign-out |
| `projects` | Project CRUD |
| `members` | Team member management |
| `reports` | Report creation, generation, PDF |
| `voice-notes` | Voice recording |
| `files` | Document/photo upload |
| `profile` | Profile, settings, usage |
| `sync` | Offline/sync indicator |

| Type tag | Meaning |
|---|---|
| `smoke` | Critical happy paths (run first) |
| `positive` | Happy-path scenarios |
| `negative` | Validation errors, wrong input, cancel dialogs |
| `empty-state` | UI with no data |

### Timeout policy

All flows use short local-stack timeouts:

| Scenario | Timeout |
|---|---|
| UI animation / element appear | 2000 ms |
| Mutation (create/update/delete) | 3000 ms |
| Fixture LLM response | 5000 ms |
| PDF render | 8000 ms |

### Flow inventory

| Directory | Flows | Purpose |
|---|---|---|
| `subflows/` | 7 | Shared setup: logout, login (Mike/Sarah/Charlie), create/delete project, create draft report |
| `auth/` | 11 | Phone OTP login, signup stepper, validation, sign-out, onboarding |
| `projects/` | 10 | Empty state, CRUD, edit, delete confirm/cancel, overview, copy buttons |
| `members/` | 6 | Owner visibility, add/remove members, validation, role selection |
| `reports/` | 13 | Empty state, fixture LLM generation, notes CRUD, tabs, finalize, PDF, delete |
| `voice-notes/` | 1 | Record, replay, delete voice note |
| `files/` | 2 | Document/photo picker cancel |
| `profile/` | 8 | Content, account details, avatar, usage, AI model, navigation, notifications |
| `sync/` | 1 | Offline banner verification |
| `cloud/` | 1 | Single linear journey for Maestro Cloud |

## CI

| Workflow | Triggers | Runs |
|---|---|---|
| `mobile-tests.yml` | every PR / push | mobile Vitest unit suite |
| `edge-function-tests.yml` | changes to `supabase/functions/**` | per-function `deno test` |
| `rls-tests.yml` (local) | PRs / pushes touching `supabase/**` | RLS suite against `supabase start` |
| `rls-tests.yml` (hosted) | nightly + manual | RLS suite against the hosted dev project |

Maestro E2E is **not** in CI yet — it runs locally and via Maestro Cloud
on demand.

## TDD workflow

1. Write a failing test at the lowest applicable layer (unit → RLS → E2E).
2. Implement the minimum code to make it pass.
3. Refactor with the test green.
4. Run the full layer (`pnpm test:mobile`, `pnpm test:rls:local`, etc.) before
   committing — coverage is enforced on PRs.

When in doubt about which layer a bug belongs in: if a mocked client could
fake the failure, it's a unit test; if it depends on a policy, trigger, or
SQL function, it's an RLS test; if it requires the user clicking through
real UI, it's a Maestro flow.
## 5. LLM fixtures

Captured LLM responses live under
[`supabase/functions/generate-report/fixtures/`](../supabase/functions/generate-report/fixtures/)
and exist so unit tests, the mobile vitest suite, and local Maestro runs can
operate without any LLM API call.

| Directory | Origin | Used by |
|---|---|---|
| `fixtures/happy/` | Captured from the real LLM via `capture-fixtures.ts` | Edge fn fixture tests, mobile vitest, USE_FIXTURES mode |
| `fixtures/errors/` | Hand-crafted | Edge fn `index.fixtures.test.ts` error coverage |
| `fixtures/prompt-version.json` | SHA-256 of `SYSTEM_PROMPT` + schema | Staleness detection |

### How fixtures are produced

- **Happy fixtures** are captured by
  [`capture-fixtures.ts`](../supabase/functions/generate-report/capture-fixtures.ts),
  which calls `fetchReportFromLLM` (the same code path the production edge
  function uses) for every sample in `sample-notes.ts` and writes
  `<name>.input.json`, `<name>.raw.txt`, `<name>.parsed.json` for each.
- **CI refresh** runs weekly and on manual dispatch via
  [`.github/workflows/capture-fixtures.yml`](../.github/workflows/capture-fixtures.yml),
  opening a PR with refreshed fixtures.
- **Staleness check** runs on PRs that touch `index.ts`, `report-schema.ts`,
  or `sample-notes.ts`. If the live `SYSTEM_PROMPT + schema` hash diverges
  from `prompt-version.json` and fixtures were not regenerated in the same
  PR, CI fails.
- **Parser-only refresh** (no LLM call): when you change the parser or schema
  but the prompt is unchanged, run `pnpm fixtures:rebuild-parsed` to refresh
  the `*.parsed.json` snapshots from the existing `*.raw.txt` files.
- **Error fixtures** are committed by hand. Add new ones whenever a real LLM
  failure mode appears that isn't already represented.

## 6. Local E2E (fixtures)

`pnpm test:e2e:local` runs Maestro flows fully offline against a zero-seed
local Supabase stack:

1. Starts (or reuses) a local Supabase stack with `supabase start` and runs
   `supabase db reset --no-seed` (skip with `SKIP_RESET=1`).
2. Serves the `generate-report` edge function with `USE_FIXTURES=true`, so
   it returns captured LLM responses instead of calling a real provider.
3. Runs `maestro test apps/mobile/.maestro/`.

All flows are self-contained: they create users via phone OTP (test codes
`888888` defined in `config.toml`), create projects/reports via UI, and
clean up after themselves. No `seed.sql` data is loaded.

The mobile binary must already be installed on the simulator and configured
to point at the local Supabase URL (`http://127.0.0.1:54321` by default).
Build steps for the binary itself are unchanged from the live Maestro
section above.

In `USE_FIXTURES` mode the edge function:

- Skips all provider API key checks. None are required.
- Matches each request against `fixtures/happy/*.input.json` by note count
  and first-note prefix; falls back to `quiet-day` with a `console.warn` on
  mismatch (visible in `supabase functions serve` output).
- Logs `[USE_FIXTURES] Matched fixture "<name>"` on every call so you can
  verify which fixture answered each E2E step.

If you change the prompt or schema and forget to refresh fixtures,
`pnpm fixtures:check` (and the CI staleness job) will tell you.
