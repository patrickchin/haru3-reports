# Maestro login / logout: why it keeps biting us, and what to do about it

This doc is a focused write-up of the login + sign-out problems we keep
re-running into in Maestro flows, the **root causes**, and the cleanest
ways to make them go away. It is the result of one long debugging session
on Android (Moto G6, Android 9, Release APK) where ~51/52 flows failed at
or just after the auth step, even though manual login works fine.

## TL;DR

1. The `subflows/ensure-logged-out.yaml` flow is **fragile by design** — it
   does three sequential `launchApp { clearState: true }` calls plus a
   `killApp`, then probes for either a logged-in or logged-out UI and
   conditionally clicks through a sign-out flow. This costs 15–30s per
   flow and breaks every time the app crashes or the splash takes too
   long.
2. **`launchApp { clearState: true }` already runs `pm clear` under the
   hood.** That wipes the app's data partition, which includes the
   `AsyncStorage` file that holds the Supabase session. After a real
   `clearState` the app *cannot* be logged in. If we still see a logged-in
   user after a `clearState`, the cause is **not** session leakage — it's
   the previous flow leaving a different process state (crashed activity,
   ANR dialog, dev-launcher selector). Stop trying to "sign out from the
   UI" — fix the launch/clear path instead.
3. We do not need the conditional in-app sign-out at all on **Release**
   builds. Release has no expo-dev-client launcher screen, and `pm clear`
   guarantees no stored session. The whole "if you see `btn-open-profile`,
   tap it then scroll to `btn-sign-out`" branch is debug-only.
4. The home-screen-on-failure-screenshot we kept seeing is **not a launch
   problem** — `launchApp` does `am start -n <pkg>/.MainActivity` directly
   (it never goes through the Android launcher). It means the app
   **process died**. The fix is to find the crash, not to add another
   relaunch.

## What "logging in" actually means in this app

| Layer | Storage | Survives `pm clear`? |
|---|---|---|
| Supabase session (access + refresh token) | `AsyncStorage` (file in `/data/data/com.harpa.pro/files/RKStorage`) | No — wiped |
| Onboarding-completed flag | `AsyncStorage` | No — wiped |
| Remembered phone number | `AsyncStorage` (`apps/mobile/lib/remembered-login.ts`) | No — wiped |
| Native cookies (SFSafariVC etc.) | None — we don't use OAuth-via-browser | n/a |
| Keychain / Keystore | None — `apps/mobile/lib/backend.ts` configures Supabase with `storage: AsyncStorage`, not `expo-secure-store` | n/a |

So **`pm clear com.harpa.pro` is sufficient** to put the app in a
"never-logged-in" state. Anything more is wasted effort or a workaround
for a different bug.

## Why `ensure-logged-out.yaml` exists today

Reading [`apps/mobile/.maestro/subflows/ensure-logged-out.yaml`](../../apps/mobile/.maestro/subflows/ensure-logged-out.yaml)
top-to-bottom, the historical reasons for each block are:

| Block | Reason it was added | Still needed? |
|---|---|---|
| 1st `launchApp { clearState: true }` | Wipe state | Yes |
| `when: "Development Build"` → tap "Harpa Pro" | Skip expo-dev-client launcher in debug builds | Debug only — no-op on Release |
| 2nd `launchApp { clearState: true }` | "Some preview launches stall on a blank shell" | Symptom, not cause — see below |
| Same dev-launcher tap, again | Same | Debug only |
| `killApp` + `launchApp { stopApp: false }` | "Process-death relaunch is more reliable" | Symptom, not cause |
| 3rd dev-launcher tap | Same | Debug only |
| `extendedWaitUntil { id: input-phone, optional: true }` | Wait for login screen | Yes |
| `extendedWaitUntil { id: btn-open-profile, optional: true }` | Detect "we're already logged in even after clearState" | **This should be impossible** — if it happens, something else is broken |
| `runFlow when: btn-open-profile { tap, scroll, sign out }` | Recover from above | Workaround for the "impossible" branch |
| Repeat the recovery once more | Belt-and-braces | Workaround for a workaround |
| Final `extendedWaitUntil { id: input-phone, timeout: 15000 }` | Make sure we ended up where we expected | Yes |

The thing that should not exist is the `btn-open-profile` branch. If
`pm clear` ran and the app still shows a logged-in profile, then either:

- the clear didn't actually run (Maestro driver was unhealthy, device
  ADB hiccup),
- the Supabase client read a session from somewhere we don't know about
  (we don't — see the storage table above), or
- the app is reading **stale module state** from a still-warm process
  because `pm clear` only wipes data, not memory of the currently-running
  process — but `clearState: true` does both clear-data **and** stop the
  process. So this should be a non-issue.

In practice the branch fires when one of the earlier launches lands on a
blank/crashed shell that *looks* visually similar to the post-login
state. The fix is to detect and recover from that, not to sign out.

## The real problems we keep hitting

### Problem 1: app crashes mid-flow → Android home screen shows up

**Symptom.** Failure screenshot is the device home screen / launcher.
Every assertion after that point fails.

**Why it isn't a Maestro problem.** `launchApp` invokes
`am start -n com.harpa.pro/.MainActivity`. That ignores the home screen
entirely. Seeing the home screen means our process died and Android fell
back to it.

**Where to look.**

```bash
adb -s <serial> logcat -c                              # clear buffer
adb -s <serial> shell am force-stop com.harpa.pro
adb -s <serial> shell am start -n com.harpa.pro/.MainActivity
sleep 10
adb -s <serial> logcat -d *:E | grep -iE 'com\.harpa|reactnativejs|androidruntime'
```

Common culprits in our build:

- **No network connectivity to Supabase.** On Android the app calls
  `EXPO_PUBLIC_SUPABASE_URL`, which on this machine is `localhost:54321`.
  That only works when `adb reverse tcp:54321 tcp:54321` (and `54324`) is
  active. ADB reverses are **per-connection** — they vanish if the cable
  is unplugged or `adb kill-server` runs. Re-add them at the top of any
  Maestro session.
- **Cleartext HTTP blocked.** Android 9+ blocks HTTP by default. The
  manifest must declare `android:usesCleartextTraffic="true"` on
  `<application>`. This is currently a local edit and not committed —
  see "Permanent fixes" below.
- **Hermes / RN bridge crash on first JS exception** (e.g. an env var
  missing because EAS profile wasn't applied to the local build).

### Problem 2: `clearState` is slower / less reliable than people expect

`launchApp { clearState: true }` runs:

```
adb shell pm clear <package>
adb shell am start -n <package>/.MainActivity
```

`pm clear` is generally fast (<1s) but on older devices (G6/Android 9) it
can hit 3–5s. Three of them back-to-back, plus a `killApp` and three
`waitForAnimationToEnd` calls, is where the 15–30s overhead in
`ensure-logged-out.yaml` comes from.

**Better:** call `pm clear` once at the top of the suite, then for every
subsequent flow call `launchApp` (no `clearState`) **only if you actually
need a fresh process**. Most flows don't — they can run inside the same
authenticated session.

### Problem 3: in-app sign-out via UI is brittle

`scrollUntilVisible { id: btn-sign-out, direction: DOWN, speed: 40 }`
inside the profile screen is the slowest and flakiest single operation
in the suite. It depends on:

- the profile screen having mounted (auth not pending),
- the scrollable region accepting a swipe at that exact velocity,
- the sign-out button having an `id`-match selector (it does, but a
  future redesign that swaps the screen for a sheet breaks this).

If we already have `pm clear` we don't need it. Delete the branch.

### Problem 4: dev-client launcher fights us in Debug builds

The "tap `Harpa Pro` if `Development Build` is visible" branches exist
because expo-dev-client shows a project picker before booting the JS
bundle. In Maestro this looks like an extra screen between `launchApp`
and the real app.

**Better workaround for Debug builds:** open the bundle URL via deep
link, which skips the launcher entirely:

```yaml
- launchApp:
    clearState: true
- openLink: "harpa://expo-development-client/?url=http://10.0.2.2:8081"
```

Or via adb:

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "harpa://expo-development-client/?url=http://10.0.2.2:8081"
```

(`harpa` is the scheme from `apps/mobile/app.json`. `10.0.2.2` is the
emulator-host alias; on a physical device use the host PC's LAN IP or
set up `adb reverse tcp:8081 tcp:8081` and use `localhost`.)

For Release builds: the launcher does not exist. The conditional
branches are dead code on Release runs but still cost a wait per flow.

## Permanent fixes

These should be made and committed once, not re-discovered each time.

### Fix A: replace `ensure-logged-out.yaml` with a minimal version

```yaml
# subflows/ensure-logged-out.yaml — minimal, Release-friendly
appId: com.harpa.pro
---
- clearState              # = pm clear; wipes AsyncStorage (Supabase session)
- launchApp
- waitForAnimationToEnd

# Optional: dev-client launcher bypass via deep link.
# Harmless on Release because openLink is a no-op when no handler exists,
# but cleaner to gate it.
- runFlow:
    when:
      visible: "Development Build"
    commands:
      - openLink: "harpa://expo-development-client/?url=http://10.0.2.2:8081"
      - waitForAnimationToEnd

- extendedWaitUntil:
    visible:
      id: "input-phone"
    timeout: 15000
```

That's it. No `killApp`, no second/third launches, no scroll-and-tap
sign-out. If `pm clear` did its job, we land on the phone-input screen.
If it didn't, we want to fail loudly so we fix the underlying bug
instead of papering over it.

### Fix B: skip clearState entirely between flows that don't need it

For a multi-flow run, the cost of a fresh login each time is huge. Two
options:

**Option B1 — share an authenticated session.** Add a one-shot
`bootstrap-mike.yaml` flow that runs first (clearState + login), then have
every subsequent flow that needs Mike start with `launchApp` only (no
clearState). This works as long as the suite is run in deterministic
order — which it isn't today. We'd need either a Maestro CLI invocation
that takes an explicit ordered list, or a single "journey" YAML that
runs subflows in sequence (we already have `cloud/journey.yaml` doing
this for Maestro Cloud — extend the model to local).

**Option B2 — seed the session via filesystem on the device.** Build the
app, log in once manually, then capture the AsyncStorage file:

```bash
adb -s <serial> shell run-as com.harpa.pro \
  cat files/RKStorage > rk-storage-mike.json
```

Then before each flow, push the file back in:

```bash
adb -s <serial> push rk-storage-mike.json /data/local/tmp/
adb -s <serial> shell run-as com.harpa.pro \
  cp /data/local/tmp/rk-storage-mike.json files/RKStorage
```

Caveats:

- `run-as` only works on **debuggable** APKs. Our Release APK is currently
  signed with the debug keystore but built `release` configuration —
  check `android:debuggable` in the manifest. If it's `false`, this
  approach needs a debug build.
- The Supabase access token in the file expires (typically 1 hour). The
  refresh token lasts much longer; on launch the client will
  auto-refresh. We need to verify that path runs without further user
  interaction.
- AsyncStorage on Android RN uses SQLite under the hood in newer
  versions; check the actual filename (`RKStorage` is the legacy plain
  file). On the current dependency pin it should still be `RKStorage`,
  but `adb shell run-as com.harpa.pro ls files/` will tell us.

This is the right long-term answer if we want fast Maestro runs but it
needs a one-time investment.

**Option B3 — deep-link an auth code (cleanest if we control the app).**
Add a debug-only deep-link handler that reads a Supabase access + refresh
token from the URL and calls `supabase.auth.setSession()`:

```yaml
- launchApp:
    clearState: true
- openLink: "harpa://e2e/login?access_token=...&refresh_token=..."
```

This requires:

- A new route `app/e2e/login.tsx` (or a `Linking` listener in `_layout.tsx`)
  gated behind `EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH === 'true'` so it never
  ships in production.
- A way to mint the tokens. Easiest: call Supabase admin API from a tiny
  helper script before the Maestro run, e.g.
  `supabase.auth.admin.generateLink({ type: 'magiclink', email: 'mike@example.com' })`,
  parse the access/refresh tokens out of the returned URL, and pass them
  into `openLink`.

Cost: one screen + one helper script, ~50 LOC total. Saves 15–30s per
flow × 50 flows = ~15 minutes per full run. Worth it.

### Fix C: commit the Android infra changes that we keep re-discovering

Right now the following are local-only edits on this machine:

- `apps/mobile/android/app/src/main/AndroidManifest.xml` —
  `android:usesCleartextTraffic="true"` on `<application>`. Required for
  any local-Supabase flow on Android 9+.
- Root `.npmrc` — `node-linker=hoisted`. Required on Windows to avoid
  MAX_PATH=260 breaking CMake during `:app:assembleRelease`. Not needed
  on macOS / Linux, so this should probably be wrapped in a conditional
  install hint rather than committed unconditionally.
- `EXPO_NO_METRO_WORKSPACE_ROOT=1` env var during Android Release build.
  Required so Expo CLI doesn't expand serverRoot up to the workspace
  root (which breaks Metro's relative entry-file resolution against
  Gradle's `entryFile` setting).

The cleartext-traffic change is unambiguously safe to commit — Release
APKs that ship to Play won't be hitting `localhost`. Better still:
restrict it via `android:networkSecurityConfig` so cleartext is allowed
only for `127.0.0.1` and `10.0.2.2`:

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">127.0.0.1</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
  </domain-config>
</network-security-config>
```

```xml
<!-- AndroidManifest.xml -->
<application
  android:networkSecurityConfig="@xml/network_security_config"
  ... >
```

That's the production-correct way and won't get flagged by Play Console.

### Fix D: stop relying on the Android launcher reappearing as a "neutral state"

If a flow ends with the home screen visible, treat that as a hard failure
in the next flow's `launchApp` — capture logcat for the prior flow's app
process and surface it. Today we silently move on and let the next flow
fail at an unrelated assertion. A small helper at the top of every flow:

```yaml
- runFlow:
    when:
      notVisible:
        id: "input-phone"
    commands:
      - launchApp                      # try to recover
      - extendedWaitUntil:
          visible:
            id: "input-phone"
          timeout: 5000
```

…isn't really a fix though — it's the same state-detection trap. The real
answer is **fail fast and tell the operator** when the app isn't running:

```yaml
- assertVisible:
    id: "input-phone"           # if missing, the app didn't launch
    timeout: 5000
```

…immediately after `launchApp`, before any other branching. That gives
us a clean "app failed to launch" signal instead of "Projects not
visible after 8s".

## Recommended order of operations next time

1. Verify `adb reverse` ports are alive: `adb reverse --list` should show
   `tcp:54321` and `tcp:54324`. If not: `adb reverse tcp:54321 tcp:54321 && adb reverse tcp:54324 tcp:54324`.
2. Verify the app launches and reaches the login screen manually:
   `adb shell am start -n com.harpa.pro/.MainActivity`. If the app dies
   here, dump logcat — fix this before touching Maestro.
3. Verify Maestro driver apps are installed: `adb shell pm list packages | grep maestro`
   should show `dev.mobile.maestro` **and** `dev.mobile.maestro.test`.
   If not, extract from the CLI jar and install (see the install snippet
   in the Android setup notes).
4. Run a single auth flow with `--debug-output`:
   `maestro --device <serial> test --debug-output /tmp/maestro-debug apps/mobile/.maestro/auth/login-phone-otp.yaml`.
   That's the canonical "is the suite even functional" check. If it
   fails, fix this one before running the whole suite.
5. Only then run the full suite with `--exclude-tags=photo-bug,wip`.

## Why the current run failed (state of play 2026-05-08)

51 of 52 flows failed. 49 of them failed at an assertion after the auth
subflow. The one failure screenshot we examined showed the **Android
home screen**, meaning the app had been killed/crashed by the time the
post-login `assertVisible: "Projects"` ran.

Most likely root causes, in order of probability:

1. **App crash after a successful OTP verify**, because the app tried to
   call a Supabase endpoint that wasn't reachable (the `adb reverse` was
   set up but a JS-side error path may have been triggered). The flow
   spent 140s (long timeouts compounded) before failing.
2. **OTP verify itself timing out** because the local Supabase auth
   service wasn't reachable from the device. Same root cause as 1.
3. **Cleartext HTTP being blocked** — but the manifest edit was applied
   locally, so this should be ruled out unless the APK installed on the
   device pre-dates the edit.

Action items before re-running:

- Pull the actual installed APK off the device and `aapt dump badging`
  to confirm `usesCleartextTraffic` is set on the build that's running.
- Run `login-phone-otp` standalone with verbose logging and capture
  logcat throughout. The crash window is 140s after the flow starts.
- Confirm the Supabase auth container is actually serving on
  `localhost:54321` from the host (`curl http://localhost:54321/auth/v1/health`)
  and that `adb reverse` is still active right before the run.
