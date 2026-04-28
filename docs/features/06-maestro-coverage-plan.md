# Maestro E2E Coverage Plan (Local, Unseeded)

Goal: rewrite the local Maestro suite so it (a) runs against an **unseeded
local Supabase**, (b) **exercises almost every interactive control** in the
app — including negative paths and validation, and (c) uses **short, local-
appropriate timeouts** so failures surface fast instead of hiding behind 30 s
waits.

Today the suite mostly tests positive smoke paths and assumes the seeded
Highland Tower / Riverside / etc. fixtures plus pre-existing draft and
finalized reports (`report-row-final-1`, `report-row-draft-0`). On a fresh
DB those flows immediately fail with timeout-shaped errors that look like
flakes.

---

## 1. Seed strategy — DECIDED: fully zero seed

The local DB starts **completely empty** (schema + RLS only, no rows).
Maestro flows create everything they need — including the auth user — via
the app's own UI. Phone OTP login on local Supabase auto-provisions the
user on first verified code, so a `signup-mike` subflow can stand in for
seeded `demo-user-0`.

Implications:

- `supabase/seed.sql` stays untouched (RLS tests still rely on it).
- `scripts/test-e2e-local.sh` runs `supabase db reset --no-seed` so the E2E
  database has zero rows.
- The "Demo Accounts" UI row only renders if the demo user exists; with a
  zero seed it won't, so flows must use the phone-OTP path. We'll bake a
  reusable `subflows/signup-or-login-mike.yaml` that:
  1. Enters `+15551234567`, taps Send Code.
  2. Enters `888888` (the dev fixed-OTP from `supabase/config.toml`).
  3. Walks the onboarding screen (full name, company) **only if** it
     appears (first-run only — gated by `runFlow.when:`).
  4. Lands on Projects tab.
- Sarah and Charlie get analogous subflows when needed.
- Profile assertions that previously hard-coded "Mike Torres" / "Torres
  Construction LLC" must now use the values typed during the signup
  subflow (kept as YAML constants at the top of each flow that needs
  them).

> **Risk** — confirmed: phone OTP must accept a fixed code on local. The
> current `supabase/config.toml` has Twilio enabled but **no**
> `[auth.sms.test_otp]` block, so `888888` (used by today's flow) is not
> actually a valid code. We'll add:
>
> ```toml
> [auth.sms.test_otp]
> "+15551234567" = "888888"  # Mike
> "+15559876543" = "888888"  # Sarah
> "+15550000003" = "888888"  # Charlie
> ```
>
> This bypasses Twilio entirely for these numbers in local mode. Hosted
> envs are unaffected (config.toml is local-only).

## 2. Timeout policy

Today's flows use 10 s–180 s waits. On a local stack with fixture LLM
responses and no network latency, almost everything resolves in <500 ms.
Long timeouts only mask real bugs.

**New defaults — DECIDED: tighter** (codify in a comment block at the top
of each flow):

| Action | Old | New |
|---|---|---|
| Animations / route transitions | implicit + 10 s waits | `waitForAnimationToEnd` only |
| `extendedWaitUntil` for normal UI state | 10 000–30 000 ms | **2 000 ms** |
| Mutations that touch local SQLite + Supabase round-trip | 20 000 ms | **3 000 ms** |
| `generate-report` edge fn (USE_FIXTURES) | 180 000 ms | **5 000 ms** |
| PDF render (`expo-print`) | 60 000 ms | **8 000 ms** (still real native work) |

If anything trips these, that's a **bug**, not a tuning problem — investigate.

Add a `MAESTRO_LOCAL_TIMEOUT_MULTIPLIER` env var read from the wrapper script
so CI / slow machines can scale every timeout uniformly without editing
flows.

## 3. Coverage matrix — every button

Inventory built from `grep testID` plus the screen tree. ✅ = currently
covered, 🟡 = positive only, 🔴 = uncovered, ⛔ = needs negative path too.

### Auth

| Surface | Control | Status | Plan |
|---|---|---|---|
| `index.tsx` | `input-phone` | 🟡 happy | Add: invalid format → inline error |
| `index.tsx` | "Send Code" button | 🟡 | Add: empty phone disabled state |
| `index.tsx` | `input-otp` | 🟡 | Add: wrong OTP → error banner |
| `index.tsx` | `use-different-number` | 🔴 | New flow — back to phone step |
| `index.tsx` | `link-signup` | 🟡 (asserts visible only) | Walk through stepper |
| `index.tsx` | `demo-user-0/1/2` | 🟡 | All three logins covered |
| `signup.tsx` | "Continue" w/ empty fields | 🔴 | New negative flow |
| `signup.tsx` | full happy path through Verify | 🔴 | New flow (uses dev OTP) |

### Projects list (`(tabs)/projects.tsx`)

| Control | Status | Plan |
|---|---|---|
| `btn-new-project` | ✅ | – |
| `btn-open-profile` | 🟡 | Already covered in tab-navigation |
| `project-row-N` tap | 🟡 | – |
| Empty-state CTA | ✅ | – |
| Pull-to-refresh | 🔴 | New: swipeDown on list |
| Search/filter (if present) | check & add | – |

### New project (`projects/new.tsx`)

| Control | Status | Plan |
|---|---|---|
| `input-project-name` validation | ✅ | – |
| `input-project-address` blank → error | 🔴 | Add to `create-project-validation` |
| `input-client-name` blank → error | 🔴 | Add |
| `btn-submit-project` happy | ✅ | – |
| `btn-back` mid-edit | 🔴 | Add: discard prompt if any |
| Submit twice (idempotency) | 🔴 | Add: rapid-tap should not double-create |

### Project overview (`projects/[projectId]/index.tsx`)

| Control | Status | Plan |
|---|---|---|
| `btn-edit-project` | ✅ | – |
| `btn-open-reports` | ✅ | – |
| `btn-open-members` | ✅ | – |
| `btn-copy-client` | 🔴 | Tap, assert toast/visual feedback |
| `btn-copy-address` | 🔴 | Tap, assert toast/visual feedback |
| Documents tile | 🔴 | Tap → file list |
| Materials & Equipment tile | 🔴 | Tap → screen |

### Edit project (`projects/[projectId]/edit.tsx`)

| Control | Status | Plan |
|---|---|---|
| `input-edit-project-name` clear → save → error | 🔴 | Negative |
| `btn-save-project` happy | 🟡 (only asserts visible) | Save and verify list updates |
| `btn-delete-project` confirm | ✅ (in report-create) | Pull into dedicated flow |
| `btn-delete-project` **cancel** | 🔴 | Negative — assert project still exists |

### Members (`projects/[projectId]/members.tsx`)

| Control | Status | Plan |
|---|---|---|
| `btn-add-member` open sheet | 🔴 | New flow |
| Add member happy path | 🔴 | Add Sarah by phone |
| Add member with non-existent phone | 🔴 | Negative |
| Remove member | 🔴 | New |
| Owner row not removable | 🔴 | Negative — assert remove disabled/absent |

### Reports list (`projects/[projectId]/reports/index.tsx`)

| Control | Status | Plan |
|---|---|---|
| `btn-new-report` | ✅ | – |
| Tap draft row → resume | 🟡 | Cover with self-created draft |
| Tap final row → detail | 🟡 | Cover with self-created final |
| Empty state | ✅ | – |

### Generate / draft (`projects/[projectId]/reports/generate.tsx`)

| Control | Status | Plan |
|---|---|---|
| `btn-tab-notes` / `btn-tab-report` toggle | 🟡 | – |
| `input-note` + `btn-add-note` | ✅ | – |
| Empty note → add disabled | 🔴 | Negative |
| Voice-note record / stop / play / delete | 🟡 | – |
| Voice-note record permission denied | 🔴 | Negative (skip on iOS sim — no mic API to deny mid-flow; assert no crash) |
| `btn-finalize-report` happy (fixtures) | ✅ via real LLM today | Migrate to fixture timeouts |
| Generate error banner (force fixture mismatch) | 🔴 | Negative — see §5 |
| `btn-back` from draft preserves note | 🔴 | Re-open and assert note still there |

### Report detail (`projects/[projectId]/reports/[reportId].tsx`)

| Control | Status | Plan |
|---|---|---|
| `btn-report-actions` | ✅ | – |
| `btn-report-view-pdf` | ✅ | – |
| `btn-report-save-pdf` | 🔴 (asserted visible only) | Tap, assert success toast |
| `btn-report-share-pdf` | 🔴 (asserted visible only) | Tap, dismiss share sheet |
| `btn-report-delete` confirm | ✅ | – |
| `btn-report-delete` **cancel** | 🔴 | Negative |
| Section scroll: Summary / Site Visit / Issues | 🟡 | Already partly asserted |

### PDF preview (`PdfPreviewModal.tsx`)

| Control | Status | Plan |
|---|---|---|
| `pdf-preview` renders | ✅ | – |
| `btn-pdf-open-externally` Android | ✅ | – |
| Close button | ✅ | – |

### Profile + sub-screens

| Surface | Status | Plan |
|---|---|---|
| `btn-open-profile` | ✅ | – |
| Account Details read-only | ✅ | – |
| Notifications row → screen + toggles | 🔴 | New flow |
| Offline Data row → screen, clear cache button | 🔴 | New flow |
| `btn-open-usage` populated | ✅ | – |
| `btn-open-usage` empty | ✅ | – |
| `btn-avatar-upload` | 🔴 | New (iOS sim cancels picker — assert cancel-safe) |
| `btn-sign-out` | ✅ | – |

### Sync / connection banners (`components/sync/*`)

Hard to trigger from a local stack but worth one flow:

| Control | Plan |
|---|---|
| `connection-banner-offline` | Toggle airplane mode via `xcrun simctl status_bar` before launch; assert banner; restore |
| `conflict-banner` + Keep mine / Use server / Diff toggle | Construct conflict by editing same row from two sessions (subflow that uses Mike then re-runs as Sarah on a shared project member) — defer to a follow-up if too complex; mark a TODO |

## 4. Flow file plan

Replace the current `apps/mobile/.maestro/` with a layered set:

```
.maestro/
  config.yaml
  subflows/
    ensure-logged-out.yaml
    login-mike.yaml             (renamed from ensure-logged-in-mike)
    login-charlie.yaml          (replaces ensure-logged-in-empty)
    create-project.yaml         (extracted; takes name var)
    delete-current-project.yaml (extracted)
    create-draft-report.yaml    (extracted)
    finalize-current-report.yaml(extracted; fixture-aware)
  auth/
    login-demo.yaml
    login-phone-otp.yaml
    login-phone-invalid.yaml          (negative)
    login-otp-wrong-code.yaml         (negative)
    use-different-number.yaml
    signup-stepper.yaml
    signup-validation.yaml            (negative)
    sign-out.yaml
  projects/
    list-empty.yaml
    list-populated.yaml               (after create flow)
    create-happy.yaml
    create-validation.yaml            (all three required fields)
    create-double-submit.yaml         (negative)
    overview-buttons.yaml             (copy chips, tiles)
    edit-save.yaml
    edit-discard.yaml                 (negative — back button)
    delete-confirm.yaml
    delete-cancel.yaml                (negative)
  members/
    add-by-phone.yaml
    add-unknown-phone.yaml            (negative)
    remove.yaml
    owner-not-removable.yaml          (negative)
  reports/
    list-empty.yaml
    new-report-happy.yaml             (USE_FIXTURES)
    new-report-empty-note.yaml        (negative)
    draft-resume.yaml
    draft-back-preserves.yaml
    finalize-and-actions.yaml         (covers save / share / delete / cancel-delete)
    pdf-in-app.yaml
    pdf-android.yaml
  voice-notes/
    record-replay-delete.yaml
  profile/
    content.yaml
    account-details.yaml
    notifications.yaml
    offline-data.yaml
    usage-populated.yaml
    usage-empty.yaml
    avatar-upload-cancel.yaml
  sync/
    offline-banner.yaml               (uses simctl)
  cloud/
    journey.yaml                       (single linear coverage flow)
```

`maestro test apps/mobile/.maestro/` recurses, so the directory structure
gives us natural grouping. Tag every flow with both a feature tag and
`positive` / `negative` / `smoke` so we can run subsets:

```
maestro test --include-tags=negative apps/mobile/.maestro/
```

## 5. How to test negative paths without a real backend failure

- **Validation**: just submit empty / malformed input — covered by client.
- **Wrong OTP**: phone OTP test path accepts `888888`; pick anything else
  for the negative case.
- **Generate-report failure**: make the wrapper script accept
  `FIXTURE_FORCE_MISMATCH=1` and have the edge fn return an error fixture
  from `fixtures/errors/`. Add one negative flow that asserts the red
  banner + Retry button render.
- **RLS denial**: log in as Sarah, navigate to Mike's project URL deeply —
  expect "not found" / empty state. Skip if router doesn't allow direct
  push.
- **Offline**: `xcrun simctl status_bar … --dataNetwork none` before
  `launchApp`; assert `connection-banner-offline`; restore in `onFlowComplete`.
- **Cancel buttons / dismiss sheets**: every confirm dialog gets two flows
  — confirm and cancel.

## 6. Build & run plan

1. **Build preview locally on iOS sim** (Release config, dev-phone-auth on):

   ```bash
   cd apps/mobile
   EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true \
   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
   EXPO_PUBLIC_SUPABASE_ANON_KEY=$(supabase status -o env | awk -F= '/^ANON_KEY=/{gsub(/"/,"",$2);print $2}') \
   pnpm exec expo run:ios --configuration Release
   ```

   If the `@expo/cli` post-build crash hits, fall back to manual
   `simctl install` per `docs/09-testing.md`.

2. **Run the local stack with auth-only seed** + fixture-mode edge fn via
   the updated `scripts/test-e2e-local.sh`.

3. **Run flows in tag waves**:

   ```bash
   pnpm test:e2e:local -- --include-tags=smoke
   pnpm test:e2e:local -- --include-tags=positive
   pnpm test:e2e:local -- --include-tags=negative
   ```

4. **Triage**: any timeout under the new short defaults is treated as a
   real bug, not a flake. Either fix the app or write down the reason in
   the flow's header comment.

## 7. Doc updates

- `docs/09-testing.md` — section "Local E2E (fixtures)": document the
  auth-only seed, new tag taxonomy, new timeout defaults, the
  `FIXTURE_FORCE_MISMATCH` and `simctl` patterns.
- `apps/mobile/.maestro/README.md` — new file pointing at the structure
  above.
- Inventory table in `docs/09-testing.md` regenerated from new flow paths.

## 8. Decisions (confirmed)

| # | Decision |
|---|---|
| 1 | **Fully zero seed**. Users created via phone-OTP signup subflow inside flows. |
| 2 | **Tighter timeouts**: 2 s UI / 3 s mutation / 5 s fixture-LLM / 8 s PDF. |
| 3 | **Many small flows** under tag taxonomy; `cloud/journey.yaml` stays as one linear flow. |
| 4 | **Offline banner only** in this pass (via `simctl status_bar`). Sync-conflict deferred. |
| 5 | **Delete** the live-LLM `report-create-and-delete.yaml` — fixture-mode flow replaces it. |

---

Execution order: zero-seed config → rewrite `test-e2e-local.sh` →
rebuild subflows → regenerate flows tree → docs → local Release iOS-sim
build → run tag waves → fix until green.
