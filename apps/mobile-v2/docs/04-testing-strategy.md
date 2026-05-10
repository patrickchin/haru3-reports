# v2 Testing Strategy

> Scope: [apps/mobile-v2/](apps/mobile-v2/). Inherits the four-layer pyramid from [docs/09-testing.md](docs/09-testing.md) but tightens the screws on the eleven recurring bug shapes catalogued in [docs/bugs/README.md](docs/bugs/README.md). Read those two before this doc.

---

## 1. Test pyramid for v2

| Layer | Tool | Lives in | Target ratio | Coverage gate |
|---|---|---|---|---|
| Unit | Vitest, mocked I/O | `apps/mobile-v2/**/*.test.{ts,tsx}` (NOT under `app/`) | ~65% of test count | 80%+ on `lib/`, hooks, pure helpers |
| Integration | Vitest + thin `react-test-renderer` harness, mocked Supabase + native modules | `apps/mobile-v2/__tests__/**/*.test.tsx` | ~20% | screens covered by Maestro instead — see [vitest.config.ts](apps/mobile/vitest.config.ts) `coverage.include` |
| RLS DB | Vitest + real Postgres via `supabase start` | `supabase/tests/rls_*.test.ts`, `supabase/tests/invariant_*.test.ts` | ~10% | every policy/RPC/trigger covered, no thresholds |
| Maestro E2E | Maestro YAML | `apps/mobile-v2/.maestro/` | ~5% (count), 100% of "must-ship" flows | testID + route coverage ≥ 90% (pre-commit + pre-push) |

**80% rule.** Branches/functions/lines/statements ≥ 80% on changed files. Excluded from coverage (mirroring [vitest.config.ts](apps/mobile/vitest.config.ts)):

- `lib/database.types.ts`, `lib/backend.ts` (generated/wiring)
- pure re-export barrels
- `lib/auth.tsx` and other RN-runtime-required providers (covered by Maestro)
- `__DEV__`-gated diagnostic branches (forced false in vitest config)
- generated types, `.d.ts`, `__mocks__/`

**`app/` rule.** No `*.test.{ts,tsx}` may live under `apps/mobile-v2/app/` — Expo Router treats it as the route tree and OTA export will bundle tests into the app. Put screen tests in `apps/mobile-v2/__tests__/`.

---

## 2. Vitest setup — React 19 act() gotchas (inherit verbatim)

Confirmed bites in v1; will bite v2 unchanged. Source: user-memory `react19-testing.md`.

```ts
// __tests__/MyScreen.test.tsx
import { act, create, type ReactTestRenderer } from "react-test-renderer";

it("renders after fire-and-forget effect", async () => {
  let tree!: ReactTestRenderer;
  // SYNCHRONOUS act — `await act(async ...)` HANGS in vitest node env.
  act(() => {
    tree = create(<MyScreen />);
  });
  // Flush `void fetch().then(setState)` style effects.
  await Promise.resolve();
  await Promise.resolve();
  act(() => {
    tree.update(<MyScreen />);
  });
  expect(tree.toJSON()).toMatchObject({ type: "View" });
});
```

Hard rules:

1. Wrap `create()` in `act(() => { ... })` for any component with `useEffect`/`useState` — without it `toJSON()` returns `null`.
2. **Never** `await act(async () => create(...))` — hangs vitest indefinitely.
3. **Never** set `globalThis.IS_REACT_ACT_ENVIRONMENT = true` — produces `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending`.
4. The "not configured to support act()" stderr warnings are harmless; do not chase them.
5. For fire-and-forget effects, flush with two `await Promise.resolve()` then `act(() => tree.update(...))`.

Vitest config (copy from [vitest.config.ts](apps/mobile/vitest.config.ts)):

- `environment: "node"` (NOT jsdom — RN doesn't need a DOM and jsdom triggers more act warnings)
- `define: { __DEV__: 'false' }`
- `esbuild: { jsx: 'automatic' }` (override `jsx="react-native"` from tsconfig)
- `setupFiles: ['./vitest.setup.ts']` with the canonical native-module stubs (see [vitest.setup.ts](apps/mobile/vitest.setup.ts))

---

## 3. Mocking policy

**Mock at the boundary.** What gets mocked:

| Mock this | How |
|---|---|
| `@/lib/backend` (Supabase client) | `vi.mock("@/lib/backend", () => ({ backend: { ... } }))` |
| `expo-modules-core`, `expo-image`, `expo-file-system/legacy`, `expo-audio` | Centralised in `vitest.setup.ts` |
| `expo-router` `useRouter`, `useLocalSearchParams` | Per-test override |
| Edge function responses (`backend.functions.invoke`) | Per-test, return realistic fixture payloads |
| `AsyncStorage` | `@react-native-async-storage/async-storage/jest/async-storage-mock` |

**Never mock:** the I/O primitive being changed. From [docs/retrospectives/2026-05-08-camera-upload-base64.md](docs/retrospectives/2026-05-08-camera-upload-base64.md): the camera-OOM bug shipped with 17 green press-and-invoke tests because the byte-pipeline (`readAsStringAsync` → `atob` → `Uint8Array`) was mocked away. Per [standard-path-first.md](.github/skills/standard-path-first/SKILL.md), if the change *is* the I/O, use a realistic fixture not a mock.

**Canonical Supabase mock:**

```ts
vi.mock("@/lib/backend", () => {
  const single = vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null });
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ single })) }));
  return {
    backend: {
      from: vi.fn(() => ({ select, insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis() })),
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
      storage: { from: vi.fn() },
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    },
  };
});
```

**Canonical realistic-fixture pattern for upload byte path** (catches camera-OOM class):

```ts
// Use a real Blob so the production code's `fetch(uri).then(r => r.blob())`
// path runs end-to-end. Do NOT mock readAsStringAsync.
it("uploads via Blob, never base64", async () => {
  const fakePng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
  global.fetch = vi.fn().mockResolvedValue({ blob: async () => fakePng } as Response);
  const uploadSpy = vi.fn().mockResolvedValue({ error: null });
  // assert payload IS a Blob, not a Uint8Array decoded from atob
  await uploadFile("file:///photo.jpg", uploadSpy);
  expect(uploadSpy.mock.calls[0][1]).toBeInstanceOf(Blob);
});
```

---

## 4. RLS test rule (mandatory — verbatim from [AGENTS.md](AGENTS.md))

> Any change that affects how the client reads, writes, or deletes a Postgres table — including new mobile code paths that hit a different table/column, switching DELETE→UPDATE (soft-delete), introducing new RPCs, or relaxing/tightening a policy — **must** ship with a matching test in `supabase/tests/rls_*.test.ts` that hits a real database. Mocked client tests do not exercise RLS and will silently pass on broken policies. If the change adds a SECURITY DEFINER RPC, also add a "direct client UPDATE/DELETE is rejected" regression assertion so the bypass is intentional, not accidental.

**Concrete triggers for v2** (each requires a new/updated `rls_*.test.ts`):

- New screen reads from a table the v1 screen didn't (e.g. v2 timeline reads `report_notes` joined to `file_metadata.upload_status`).
- Switching client `delete()` to `update({ deleted_at })` — see [supabase/tests/rls_soft_delete.test.ts](supabase/tests/rls_soft_delete.test.ts).
- New SECURITY DEFINER RPC (e.g. `soft_delete_voice_note`).
- New column added to an RLS-gated table.
- Tightening or relaxing any `ALTER POLICY`.
- New mobile mutation against `project_members`, `token_usage`, `file_metadata.upload_status`.

**Required matrix per surface** (from R10, [docs/bugs/README.md](docs/bugs/README.md)):

1. REST policy (active member with correct role) — happy path.
2. Every SECURITY DEFINER RPC — happy + denial.
3. Direct client UPDATE/DELETE bypass attempt — must reject.
4. Parent-tombstone visibility — soft-deleted project hides children.
5. Revoked / downgraded membership — write fails with current role check.

See [supabase/tests/README.md](supabase/tests/README.md) for runner setup.

---

## 5. Maestro rules

**Hard rules** (R2, R6–R9):

1. **No `optional: true` on assertions that must pass.** `optional: true` is for *flow-skipping* (the element might not be present this run), not assertion-skipping. `assertVisible: "Summary" optional: true` is zero coverage.
2. **TestID/route changes ship in the same PR as the matching flow update.** Pre-commit gate enforces ≥ 90% testID + route coverage.
3. **Run the affected flow locally before opening the PR.** Triage order on E2E failures (R9): (1) does this build/backend complete the operation, (2) does the testID still exist, (3) is the assertion on the right screen — only then suspect the feature.
4. **Cleanup nav depth is derived, not hard-coded.** No `tapOn: btn-back` × N — use `launchApp: { clearState: false }` plus idempotent re-navigation (R8).
5. **Fixture-mode flows are tagged `fixture-mode`** and excluded from non-fixture suites (R7).
6. **`extendedWaitUntil` for upload-pending rows must accept "pending OR completed"** — fast uploads can finish before the assertion lands.

**Required v2-launch flow catalogue** (derived from the must-ship features in [apps/mobile-v2/docs/00-current-state.md](apps/mobile-v2/docs/00-current-state.md) and the bug log):

| Flow | Tag | Why required |
|---|---|---|
| `auth/login-phone-otp.yaml` | `smoke,auth` | Fast path; demo deep-link backstop |
| `projects/create-project.yaml` | `smoke` | Foundation for every other flow |
| `projects/cross-user-rls.yaml` | `negative,rls` | RLS-revoked-member rejection at UI layer (R10) |
| `reports/new-report-fixture-happy.yaml` | `smoke,fixture-mode` | Compose with text + photo + voice + file |
| `reports/note-timeline-order.yaml` | `regression` | R11 photo bridge unmount regression |
| `reports/note-add-and-remove.yaml` | `mutation` | Optimistic insert + soft-delete |
| `voice-notes/record-replay-delete.yaml` | `voice,fixture-mode` | Required asserts: title, summary, `voice-note-summary-*`, `btn-voice-note-summarize-*` disappears (R2) |
| `voice-notes/playback-coordination.yaml` | `voice` | Single-player audio ducking |
| `files/upload-photo.yaml` | `mutation,fixture-mode` | Photo upload visual continuity (R11) |
| `files/upload-document.yaml` | `mutation,fixture-mode` | File pipeline parity |
| `members/invite-and-revoke.yaml` | `mutation,rls` | Pairs with RLS revoked-member test |
| `profile/account-settings.yaml` | `smoke` | Profile + logout + cache clear |
| `profile/usage.yaml` | `smoke` | Token dashboard rendering |

---

## 6. TestIds-as-typed-registry

The biggest v1 risk per [apps/mobile-v2/docs/00-current-state.md](apps/mobile-v2/docs/00-current-state.md): no central registry — renames break Maestro silently. v2 fixes this with a typed registry that makes renames break TypeScript first.

```ts
// apps/mobile-v2/lib/test-ids.ts
export const TestId = {
  loginSendCode: "btn-login-send-code",
  loginVerifyCode: "btn-login-verify-code",
  recordStart: "btn-record-start",
  recordStop: "btn-record-stop",
  voiceNoteCard: (fileId: string) => `voice-note-card-${fileId}` as const,
  pendingPhoto: (localId: string) => `pending-photo-${localId}` as const,
} as const;

export type TestIdValue = typeof TestId[keyof typeof TestId];
```

App side:

```tsx
<Pressable testID={TestId.recordStart} onPress={onStart} />
```

Maestro side — generate a YAML-friendly companion file at build time and reference it:

```yaml
# .maestro/auth/login-phone-otp.yaml
- tapOn:
    id: ${output.TestId.loginSendCode}    # injected via maestro env from generated test-ids.json
```

The press-test catalog gate ([apps/mobile/__tests-config__/press-test-catalog.ts](apps/mobile/__tests-config__/press-test-catalog.ts)) is ported verbatim:

- **No orphan**: every `testID="btn-..."` in source must be in the catalog.
- **No phantom**: every catalog entry must exist in source.
- **Risky buttons covered**: `risks: ["mutation" | "destructive" | "auth" | "native-permission"]` requires either a unit press test OR a Maestro flow.

---

## 7. Per-feature test checklist

Minimum to ship v2:

| Feature | Unit (Vitest) | Integration | RLS | Maestro |
|---|---|---|---|---|
| **Auth** | OTP validators, session-restore branches | sign-in screen render + error paths | profiles RLS (own-only, phone isolation) | `login-phone-otp` |
| **Projects** | useLocalProjects reducers, sort/filter | project list + empty state | `rls_projects` (owner CRUD, soft-delete, stranger denial) | `create-project`, `cross-user-rls` |
| **Reports** | report-edit-helpers immutability, finalize state machine | EditTabPane state | `rls_reports` (role-based insert, owner-only delete) | `new-report-fixture-happy`, `report-soft-delete-hides-notes` |
| **Notes timeline** | useNoteTimeline incl. **R11 in-flight bridge case** | NoteTimeline render swap | `rls_report_notes` (matrix from R10) + `invariant_report_notes_file_link` | `note-timeline-order`, `note-add-and-remove` |
| **Voice notes** | voice-note-flow, useSummarizeVoiceNote optimistic merge (R3) | VoiceNoteCard playback states | `rls_file_metadata` voice rows | `record-replay-delete` (asserts not optional, R2), `playback-coordination` |
| **Photo upload** | jobs.ts pure reducer (every state edge), preprocess pipeline with **real Blob fixture** (no atob mock) | uploader orchestration with Blob fixture | `rls_file_metadata_upload_status` state machine | `upload-photo` (pending-or-completed accepted) |
| **File upload** | document MIME branches | uploader routes by category | `rls_file_metadata` | `upload-document` |
| **Members** | role gating helpers | invite dialog | `rls_project_members` (admin add/remove, viewer denial, `get_project_team` RPC) | `invite-and-revoke` |
| **Account** | avatar upload via Blob | profile form validation | `rls_profiles` | `account-settings` |
| **Usage** | usage aggregator | usage list render | `rls_token_usage` (other users hidden) | `usage` |

---

## 8. Coverage enforcement

Per-package thresholds in `apps/mobile-v2/vitest.config.ts` (start permissive, ratchet up):

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "lcov", "json-summary"],
  include: ["lib/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
  exclude: [
    "**/*.test.{ts,tsx}", "**/__mocks__/**", "**/*.d.ts",
    "lib/backend.ts", "lib/database.types.ts",
    "lib/auth.tsx", "lib/uploads/build-default-queue.ts",
  ],
  thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
}
```

CI gates (mirroring [docs/09-testing.md](docs/09-testing.md) hooks section):

- **pre-commit**: `pnpm test:mobile-v2` + `pnpm --filter mobile-v2 test:e2e:coverage`
- **pre-push**: same + `pnpm build:mobile-v2:update`
- **CI PR check**: unit + RLS local + edge-fn deno + Maestro testID coverage gate
- Bypass with `SKIP_PRE_COMMIT_CHECKS=1` or `git commit --no-verify` only when the change is doc-only.

---

## 9. Snapshot / golden tests

**Allowed:** rendered HTML for report PDF export (`packages/report-core` HTML golden) — output is the contract; whitespace-stable.

**Banned:** UI component snapshots. They produce green CI for fragile output and no signal — render assertions on observable text/role/testID instead. (R3 + R6 say snapshots wouldn't have caught any of the eleven recurring bugs.)

---

## 10. CI matrix

| Trigger | Suites |
|---|---|
| Every push to feature branch | Mobile-v2 unit (vitest), edge-fn deno, RLS local (if `supabase/**` touched), Maestro testID coverage gate |
| PR to `dev` | + RLS local always, + `pnpm build:mobile-v2:update`, + lint |
| Nightly | RLS hosted (drift detection), Maestro live (real LLM, smoke tag only), fixture-divergence check (`pnpm fixtures:check`) |
| Pre-release tag | Full Maestro suite (live), RLS hosted, edge-fn deno integration with real provider, OTA export check |

---

## 11. Bug-driven regression rules (R1–R11 → required test type)

| Pattern | Source | Required test type to catch a recurrence |
|---|---|---|
| **R1** Fixture-mode stub hides side effect | [docs/bugs/README.md](docs/bugs/README.md) | Maestro fixture-mode flow asserting the **DB-write-after-LLM** outcome (title/summary visible). Unit test on hook is insufficient. |
| **R2** `optional: true` on must-pass assertion | same | Lint rule + PR review checklist; CI grep `\\soptional:\\s*true` near `assertVisible` and require justification comment. |
| **R3** Mutation success without optimistic update | same | Unit test on the hook asserting cache contents synchronously after `mutate()` resolves, before any refetch. |
| **R4** Mocked test for cross-boundary path | same | At least one Maestro fixture-mode flow per cross-boundary pipeline (client → edge fn → DB → refetch). |
| **R5** Threshold-gated UI hidden by short fixture | same | Fixture data must cross every documented threshold by ≥ 20% margin; unit test asserts threshold value matches fixture length. |
| **R6** TestID drift | same | TestId registry (§6) + press-test-catalog gate. TS compile fails on rename. |
| **R7** Untagged fixture-mode flow | same | CI fails Maestro suite if flow uses fixture-only testIDs without `fixture-mode` tag. |
| **R8** Hard-coded cleanup nav depth | same | `launchApp: { clearState: false }` + idempotent navigation in cleanup; no `tapOn: btn-back` chains. |
| **R9** E2E timeout triage | same | Process rule, not a test — failure triage doc linked from CI logs. |
| **R10** RLS hardening missed sibling entry point | same | Full RLS matrix per surface (REST + every RPC + direct UPDATE/DELETE bypass + parent tombstone + revoked membership), all in same `rls_<table>.test.ts`. |
| **R11** Optimistic-row swap unmount | same | Unit test on the timeline merge layer with the **in-flight state**: entity row present, relationship row absent, `localId` known — assert single React key, capture-time sort, no unmount. |