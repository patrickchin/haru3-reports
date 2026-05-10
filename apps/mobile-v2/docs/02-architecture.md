# v2 Architecture

`apps/mobile-v2/` — clean-slate rewrite of `apps/mobile/`. Same product, same backend, ~50% fewer LOC. Read [apps/mobile-v2/docs/00-current-state.md](apps/mobile-v2/docs/00-current-state.md) first.

---

## 1. Goals & Non-Goals

### Goals
- Cut LOC from ~22.5k to ≤11k by collapsing god components, unifying dialog/sheet primitives, and pushing more state into React Query.
- One way to do each thing: one form library, one dialog primitive, one query-key factory, one upload queue, one audio player.
- Every screen is a thin composition of feature modules — no business logic in route files.
- Maintain Maestro green from day one via a typed testID registry.
- Preserve known-good v1 patterns (upload reducer, screen-scoped audio player, immutable report helpers).

### Non-Goals (will NOT change)
- Supabase backend: schema, RLS policies, edge functions, RPCs.
- Maestro `.maestro/*.yaml` flow semantics — testID **values** (the strings) stay byte-identical so flows keep working.
- Design tokens — same colour palette, spacing scale, typography ramp from [apps/mobile/lib/design-tokens/colors.ts](apps/mobile/lib/design-tokens/colors.ts).
- Fixture-mode flag names: `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE`, server `USE_FIXTURES`, `FIXTURES_DELAY_MS`.
- Visual design — pixel-equivalent screens.
- Shared package contract: still consume [packages/report-core/src/index.ts](packages/report-core/src/index.ts) verbatim.
- PowerSync / true offline-first — see §11.

---

## 2. Architectural Principles

| # | Principle | Concrete consequence |
|---|-----------|----------------------|
| 1 | **Server state lives in React Query.** | Almost no `useState` for fetched data. No `Context` for server data. |
| 2 | **Screen-as-feature-module.** | Each route delegates to one `<FeatureScreen>` from `features/<name>/`. Route files are ≤30 LOC. |
| 3 | **Pure reducers for state machines.** | Upload jobs, recorder lifecycle, draft-report editor — all `(state, event) => state` with zero I/O. |
| 4 | **No global mutable singletons except infrastructure.** | Allowed: Supabase client, React Query client, UploadQueue runtime, Notifee. Banned everywhere else. |
| 5 | **Immutability discipline.** | Reducers, helpers, and React state always return new objects. ESLint `no-param-reassign` enabled. |
| 6 | **Standard-path-first.** | `crypto.randomUUID()` (with `expo-crypto` fallback shaped as RFC 4122). `Blob`/`fetch` for binaries — no base64 char-code loops. `react-hook-form` + `zod` for forms — no hand-rolled validators. See [/Users/patchin/.claude/rules/common/standard-path-first.md](/Users/patchin/.claude/rules/common/standard-path-first.md). |
| 7 | **Boundary validation.** | All edge-function responses parsed through zod at the data layer; never `as T`. |
| 8 | **Two-tier component library.** | `shared/ui/` = primitive (Button, Card, Sheet); `features/*/components/` = composed and feature-aware. No three-deep abstraction towers. |

---

## 3. Module Boundaries

Layered, dependency flows **downward only**. Enforced via `eslint-plugin-boundaries`.

```
apps/mobile-v2/
├─ app/              expo-router routes — composition only
├─ features/         vertical slices, one per product feature
├─ entities/         domain types + zod schemas + query-key factories
├─ shared/           UI primitives, hooks, utils (no domain knowledge)
└─ infra/            Supabase client, React Query client, upload runtime,
                     Notifee, design tokens, env, logger
```

| Layer | May import from | Example file | Purpose |
|-------|-----------------|--------------|---------|
| `app/` | features, shared, infra | `app/projects/[projectId]/reports/[reportId].tsx` → `<ReportDetailScreen reportId={…} />` | Wire route params to a feature screen. |
| `features/` | entities, shared, infra, *other features only via public `index.ts`* | `features/voice-notes/components/VoiceNoteCard.tsx` | Self-contained feature. Owns its components, hooks, dialogs. |
| `entities/` | shared, infra | `entities/report/schema.ts` (zod), `entities/report/keys.ts` (query keys) | Domain types + cache topology. No React. |
| `shared/` | infra | `shared/ui/Sheet.tsx`, `shared/hooks/useDialog.ts` | Reusable, no domain knowledge. |
| `infra/` | nothing in this repo | `infra/supabase.ts`, `infra/queryClient.ts`, `infra/uploadQueue/` | Cross-cutting wiring. |

Feature module shape:
```
features/voice-notes/
├─ index.ts              public exports only
├─ components/
├─ hooks/                useVoiceNotes, useTranscribe, useSummarize
├─ dialogs/              VoiceNoteOptionsDialog, etc.
└─ machines/             recorderMachine.ts (pure reducer)
```

---

## 4. Data Layer

### Supabase client — one singleton in `infra/supabase.ts`
```ts
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true } },
);
```
- Anon key only. Service-role usage in app code = build-time error (lint rule + CI grep).
- Single `RealtimeChannel` registry for subscriptions.

### React Query setup — `infra/queryClient.ts`
```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 2,
               refetchOnWindowFocus: true /* mapped to AppState=='active' */ },
    mutations: { retry: 0 },
  },
});
```
Persisted via `@tanstack/query-async-storage-persister` for: auth-bound metadata cache only (NOT mutations). Whitelist by query-key prefix.

### Query-key factory — one per entity in `entities/<x>/keys.ts`
```ts
export const reportKeys = {
  all: ["reports"] as const,
  byProject: (pid: string) => [...reportKeys.all, "project", pid] as const,
  byId: (rid: string) => [...reportKeys.all, "id", rid] as const,
  notes: (rid: string) => [...reportKeys.byId(rid), "notes"] as const,
};
```
- Hierarchical so `invalidateQueries({ queryKey: reportKeys.byId(rid) })` cascades correctly.
- **No string-literal keys** anywhere outside the factory (lint rule).

### Mutation pattern
```ts
const useUpdateReportSection = (reportId: string) =>
  useMutation({
    mutationFn: (patch: Patch) => updateReportSection(reportId, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: reportKeys.byId(reportId) });
      const prev = queryClient.getQueryData<Report>(reportKeys.byId(reportId));
      queryClient.setQueryData(reportKeys.byId(reportId), applyPatch(prev, patch));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && queryClient.setQueryData(reportKeys.byId(reportId), ctx.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: reportKeys.byId(reportId) }),
  });
```

### Cache invalidation rules
| Action | Invalidates |
|--------|-------------|
| Create/edit/delete report | `reportKeys.byProject(pid)`, `reportKeys.byId(rid)` |
| Add/edit/delete note | `reportKeys.notes(rid)`, `fileKeys.byProject(pid)` if voice/file |
| Upload completes | `fileKeys.byProject(pid)`, `reportKeys.notes(rid)` if linked |
| Member change | `projectKeys.byId(pid)` + invalidate **all** child keys (R10: revoked-role visibility) |

### Optimistic + R11 (in-flight swap)
- Pending entries carry the eventual `fileId` from the moment we have it.
- Merge layer in the `useReportNotes` selector keys rows by `optimisticId` and **promotes** rows once `file_metadata` lands, even before the `report_notes.file_id` linkage row exists.
- Sort by client capture time until the linkage row arrives, then by `created_at`.
- Unit test required: case where entity row exists, linkage row absent → row visible, key stable.

### RLS-respecting queries (R10)
- Always include the canonical access filter (`project_id`, `report_id`) — never rely on `select *` over a denormalized table.
- Soft-delete: every list query `is("deleted_at", null)` plus parent-soft-delete cascade asserted server-side; client never trusts that.
- Helpers in `entities/<x>/queries.ts` centralize this; raw `.from("…")` calls in components = lint error.

---

## 5. Upload + Media Pipeline

Keep v1's pure-reducer + worker-loop design verbatim — it works. See [docs/10-media-pipeline.md](docs/10-media-pipeline.md).

### Layout
```
infra/uploadQueue/
├─ jobs.ts          pure reducer (state, event) => state
├─ runtime.ts       singleton: Map + AsyncStorage + worker loop + emitter
├─ uploader.ts      preprocess → blob → PUT → finalize
└─ index.ts         public API
```

### Public API
```ts
export type UploadInput = {
  uri: string;
  projectId: string;
  reportId?: string;
  kind: "photo" | "document" | "voice" | "avatar";
  // R11: caller passes the eventual fileId so optimistic rows can bridge.
  fileId: string;             // crypto.randomUUID() at enqueue
  optimisticRow?: PendingRow; // for the timeline merge layer
};

export const uploadQueue = {
  enqueue(input: UploadInput): JobId,
  cancel(jobId: JobId): void,
  retry(jobId: JobId): void,
  subscribe(fn: (snapshot: Snapshot) => void): Unsubscribe,
  getJob(jobId: JobId): UploadJob | undefined,
};
```

### Platform requirements
| Concern | Approach |
|---------|----------|
| iOS background | `expo-file-system` `uploadAsync` w/ `BACKGROUND_SESSION` (NSURLSession). OS finishes after JS killed. |
| Android background | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` + `POST_NOTIFICATIONS` permissions; Notifee foreground service notification while queue non-empty. |
| Memory | `Blob` from local `file://` URI fed straight to `fetch` PUT — never base64. Standard-path-first. |
| Persistence | Snapshot every 200 ms (debounced) to AsyncStorage; failed jobs >24 h purged on boot. |
| Single-flight | Worker drains FIFO; concurrency = 1 (cellular) / 2 (wifi). |

`useUploadJob(jobId)` hook is a `useSyncExternalStore` over `uploadQueue.subscribe` — no React Query for queue state (it's a mutable runtime, not a server resource).

---

## 6. Audio Playback

Preserve v1: one `AudioPlayer` instance per screen, listener-driven, `interruptionMode` ducking.

```ts
// features/audio/AudioPlaybackProvider.tsx
const AudioPlaybackContext = createContext<AudioPlaybackApi | null>(null);

export type AudioPlaybackApi = {
  play(track: { id: string; uri: string; durationMs?: number }): Promise<void>;
  pause(): void;
  seek(ms: number): void;
  status: { trackId: string | null; positionMs: number; isPlaying: boolean };
};

export const AudioPlaybackProvider: FC<PropsWithChildren> = ({ children }) => {
  // single expo-audio AudioPlayer, lifecycle tied to mount/unmount
  // tears down on pathname change via useSegments() effect
  // sets interruptionMode "doNotMix" on play, "mixWithOthers" on stop
};

export const useAudioPlayback = () => useContextOrThrow(AudioPlaybackContext);
```

Mounted inside the `(tabs)` layout and inside `reports/[reportId]` and `reports/generate` layouts — three independent screen-scoped instances.

---

## 7. Routing / Navigation

Same expo-router file-based routes as v1 (Maestro deep-links must keep working).

| Route | File | Notes |
|-------|------|-------|
| `/` | `app/index.tsx` | Auth gate → redirect |
| `/onboarding` | `app/onboarding.tsx` | |
| `/(tabs)/projects` | `app/(tabs)/projects.tsx` | |
| `/projects/[projectId]/reports/[reportId]` | `app/projects/[projectId]/reports/[reportId].tsx` | |
| `/projects/[projectId]/reports/generate` | `app/projects/[projectId]/reports/generate.tsx` | |
| `/(camera)/capture` | `app/(camera)/capture.tsx` | |
| `/account` | `app/account.tsx` | |
| `/usage` | `app/usage.tsx` | |
| `/e2e/login` | `app/e2e/login.tsx` | Dev-only — see §13 |

Route files are pure composition:
```tsx
// app/projects/[projectId]/reports/[reportId].tsx
export default function Route() {
  const { projectId, reportId } = useLocalSearchParams<{...}>();
  return <ReportDetailScreen projectId={projectId!} reportId={reportId!} />;
}
```

---

## 8. Styling & Design System

- **NativeWind v4** + Tailwind. Same `tailwind.config.js` as v1 with the same token map.
- Design tokens live in `infra/design-tokens/` and are exported both as Tailwind theme extension and as a TS constants object (for icon colours, status bars, etc.).
- `clsx` only — drop `tailwind-merge` if not load-bearing; if needed, isolate to `shared/ui/cn.ts`.

### One primitive per concern in `shared/ui/`

| Primitive | Replaces in v1 | API sketch |
|-----------|----------------|------------|
| `<Button>` | scattered Pressable+Text | `variant`, `tone`, `size`, `loading`, `leftIcon`, `testID` |
| `<Card>` | inline View+rounded | `tone`, `padding`, `header`, `footer` |
| `<Sheet>` | RN Modal + AppDialogSheet | unified §below |
| `<TextField>` | TextInput + label + error | controlled+RHF compatible |
| `<Dialog>` | thin wrapper over `<Sheet kind="dialog">` | |

### Unified Dialog/Sheet primitive — kills the "3-dialogs-inlined-per-card" smell

```ts
// shared/ui/Sheet.tsx
export type SheetAction = { label: string; onPress: () => void;
  variant?: "default" | "destructive" | "primary"; testID?: string };

export type SheetSpec = {
  kind: "alert" | "confirm" | "options" | "form";
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  body?: ReactNode;
  actions: SheetAction[];
  testID: TestId;            // typed — see §14
};

// imperative API via context — no useState booleans
export const useSheet = (): { open(spec: SheetSpec): Promise<string|null> } => …;
```

Replaces v1's pattern of 3-5 `useState<boolean>` per card with one imperative call:
```ts
const sheet = useSheet();
const onMore = async () => {
  const choice = await sheet.open({
    kind: "options", title: "Voice note", testID: testIds.voiceNote.optionsSheet(id),
    actions: [
      { label: "Transcript", onPress: () => …, testID: testIds.voiceNote.viewTranscript(id) },
      { label: "Delete", variant: "destructive", onPress: () => …, testID: … },
    ],
  });
};
```

---

## 9. Forms

**Decision: `react-hook-form` + `@hookform/resolvers/zod`.** Justified deviation from v1's controlled-prop pattern: RHF gives uncontrolled inputs (no re-render per keystroke), per-field validation, `useFieldArray` for the row-of-N pattern, and reduces ReportEditForm from ~800 LOC to <200.

### Row-of-N pattern (replaces ReportEditForm god component)

Each section = one small component using `useFieldArray`:

```tsx
// features/reports/edit/sections/RolesSection.tsx
export function RolesSection({ control }: { control: Control<EditReportForm> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "roles" });
  return (
    <Section title="Workers" onAdd={() => append(emptyRole())}>
      {fields.map((f, i) => (
        <RoleRow key={f.id} control={control} index={i} onRemove={() => remove(i)} />
      ))}
    </Section>
  );
}
```

Top-level form file is now a list of section imports + one `useForm({ resolver: zodResolver(reportSchema) })`. Zod schema lives in `entities/report/schema.ts` so v2 and edge functions share validation shape (re-exported via report-core where applicable).

Submission goes through the optimistic mutation in §4 — the form layer doesn't know the cache exists.

---

## 10. Error & Boundary Strategy

| Layer | Mechanism |
|-------|-----------|
| Root | `<RootErrorBoundary>` in `app/_layout.tsx` — full-screen "Something went wrong / Reload". |
| Per route | `<ScreenErrorBoundary>` inside each tab's `_layout.tsx` — local fallback, lets other tabs keep working. |
| Per query | React Query `useQueryErrorResetBoundary()` + boundary at feature-screen root. |
| Mutations | Toast via Notifee in-app channel. Standard `onError` helper in `infra/mutations.ts`. |
| Network failure UX | Inline retry chip in the affected card, NOT a full-screen blocker. Upload jobs surface failure on the pending row with a retry button. |

Notifee is the **only** notification surface — for both background-upload progress and foreground toasts. No `Alert.alert` (matches v1 rule). No third toast library.

---

## 11. Offline / Persistence

| Persisted | Storage | Why |
|-----------|---------|-----|
| Auth session | Supabase + AsyncStorage | Required for cold-start auth. |
| Upload queue snapshot | AsyncStorage | OS-level background uploads survive app kill. |
| React Query cache (whitelist) | AsyncStorage via persister | Faster cold start of project list and last-viewed report. |
| Draft report in compose | React Query cache (mutation state) | If app dies mid-edit, draft is recoverable on next open of the same report. |

**Not persisted (v2 v1):** generic write-while-offline of arbitrary mutations. PowerSync is the planned answer — **out of scope**, see [memories/repo/powersync-future.md].

---

## 12. Concurrency & Background Work

| Concern | Policy |
|---------|--------|
| Upload concurrency | 1 (cellular) / 2 (wifi). Single-flight worker. |
| Query refetch | `refetchOnAppStateChange === "active"` (custom focus manager wrapping React Native `AppState`). No interval polling. |
| Realtime subscriptions | Subscribed lazily per visible screen; unsubscribed on `useEffect` cleanup. |
| Audio focus | `expo-audio` `interruptionMode: "doNotMix"` on play; `"mixWithOthers"` on stop so iOS resumes user music. |
| App-state lifecycle | Single `AppStateProvider` in `infra/` exposes `state`, `lastActiveAt`. Upload runtime checks state to show foreground notification. |

---

## 13. Security

- **Anon key only** in client. Lint rule rejects `SUPABASE_SERVICE_ROLE_KEY` import in `apps/mobile-v2/**`.
- Secrets via EAS env vars (build-time inlined for `EXPO_PUBLIC_*`) and `.env.local` for dev. Never committed.
- No hardcoded secrets — pre-commit hook greps for `eyJ` JWT-shaped strings, `sk-`, `service_role`, etc.
- **RFC 4122 UUIDs only.** `infra/ids.ts`:
  ```ts
  import { randomUUID as expoRandomUUID } from "expo-crypto";
  export const newId = (): string =>
    globalThis.crypto?.randomUUID?.() ?? expoRandomUUID();
  ```
  Never `${time}-${rand}` — PostgREST silently rejects (memory: supabase-postgrest gotcha).
- Deep-link `e2e/login` route: top of file
  ```ts
  if (!__DEV__ && !env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH) {
    return <Redirect href="/" />;
  }
  ```
  Plus the route file is excluded from production bundles via Metro's `resolver.blockList` when `EAS_BUILD_PROFILE === "production"`.
- Boundary validation: every edge-function response goes through a zod parser before reaching components.
- RLS-bypass surfaces (SECURITY DEFINER RPCs) are wrapped in named functions in `entities/<x>/rpcs.ts` and require an accompanying `supabase/tests/rls_*.test.ts` file. Per AGENTS.md and R10.

---

## 14. Cross-Cutting Concerns

### Logging — `infra/logger.ts`
Simple leveled logger (`debug/info/warn/error`) gated by `__DEV__` and `EXPO_PUBLIC_LOG_LEVEL`. No `console.log` outside this module (lint rule). Production: `error` only, dropped to a Notifee-backed in-app log buffer (replaces v1's lack of crash-time triage).

### Telemetry — stub
`infra/telemetry.ts` exposes `track(event, props)`, `identify(userId)`, `reset()`. Default impl is no-op + logger.debug. Real provider plugged in later. Component code calls `track`, never the provider.

### Feature flags — `infra/flags.ts`
```ts
export const flags = {
  voiceNoteSummary: env.EXPO_PUBLIC_FF_VOICE_NOTE_SUMMARY === "true",
  pdfExport: env.EXPO_PUBLIC_FF_PDF_EXPORT !== "false",
} as const;
```
Build-time (Metro inlines `EXPO_PUBLIC_*`). Runtime flags require a server fetch — explicitly out of scope for v2 v1.

### testID registry — `infra/testIds.ts`
Solves v1's #1 risk: no central registry → Maestro flows break on rename.

```ts
export const testIds = {
  reports: {
    list: "report-list" as const,
    row: (i: number) => `report-row-${i}` as const,
    finalizeBtn: (id: string) => `btn-finalize-report-${id}` as const,
  },
  voiceNote: {
    card: (fileId: string) => `voice-note-card-${fileId}` as const,
    title: (fileId: string) => `voice-note-title-${fileId}` as const,
    summary: (fileId: string) => `voice-note-summary-${fileId}` as const,
    summarizeBtn: (fileId: string) => `btn-voice-note-summarize-${fileId}` as const,
    optionsSheet: (fileId: string) => `dialog-voice-note-options-${fileId}` as const,
    viewTranscript: (id: string) => `btn-voice-note-transcript-${id}` as const,
  },
  uploads: { pendingPhoto: (localId: string) => `pending-photo-${localId}` as const },
  // …
} as const;

export type TestId = string & { __brand: "testId" };
```

- Every component prop typed `testID` accepts only strings produced by this registry (branded type).
- A CI check parses `.maestro/**/*.yaml`, extracts every `id:` reference, and asserts each one is producible by `testIds`. Renaming a registry value without updating Maestro = CI red.
- The **string values** match v1 exactly so existing `.maestro/*.yaml` files keep working unchanged.

### Fixture mode plumbing
Single source of truth in `infra/env.ts`:
```ts
export const env = {
  isE2EVoiceMock: process.env.EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE === "true",
  isDevPhoneAuth: process.env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH === "true",
} as const;
```
Branches on `env.isE2EVoiceMock` only inside the recorder hook. Server fixtures untouched (`USE_FIXTURES`, `FIXTURES_DELAY_MS`).

---

## 15. ADRs

### ADR-001 — Server state via React Query, no global state lib
- **Context.** v1 uses React Query + `useState` + tiny contexts and it works. Adding Zustand/Redux would duplicate caching logic that React Query already provides.
- **Decision.** React Query is the only state container for server data. `useState`/`useReducer` for ephemeral UI. Context for screen-scoped runtimes (audio, sheet).
- **Consequences.** Less code, fewer abstractions. Some cross-screen UI state (e.g., compose-tab index) lives in route params or React Query (as a UI-state query). No global store to inspect — accept it.
- **Alternatives.** Zustand (rejected: extra surface for marginal gain), Redux Toolkit (rejected: way too much ceremony), Jotai (rejected: not needed at this scale).

### ADR-002 — `react-hook-form` + zod for forms
- **Context.** v1 ReportEditForm is ~800 LOC of controlled inputs and manual validation. `useFieldArray` + zod resolver collapses this naturally.
- **Decision.** RHF + `@hookform/resolvers/zod`, schemas in `entities/<x>/schema.ts`.
- **Consequences.** -600 LOC in the report editor. Standard-path-first compliant. Adds 2 deps (~25 KB gzipped).
- **Alternatives.** Formik (slower, larger, less RN-friendly), hand-rolled (current — the problem we're solving), TanStack Form (less mature on RN).

### ADR-003 — expo-router file-based navigation, unchanged
- **Context.** v1 routes are stable, Maestro deep-links depend on the exact paths.
- **Decision.** Same expo-router; no React Navigation rewrite.
- **Consequences.** Maestro flows keep working. Route files become 1-line composition wrappers.
- **Alternatives.** Bare React Navigation (rejected: route-string churn, breaks deep links).

### ADR-004 — NativeWind v4 + tokens, no styled-components
- **Context.** v1 already on NativeWind; the design system is stable.
- **Decision.** Continue NativeWind v4. Tokens centralized in `infra/design-tokens/`.
- **Consequences.** Zero migration risk. Class strings stay greppable.
- **Alternatives.** Tamagui (rejected: large rewrite, theming model very different), Stylesheets (rejected: regression in DX).

### ADR-005 — Single `<Sheet>` primitive with imperative `useSheet()` API
- **Context.** v1 inlines 3-5 `AppDialogSheet` per card with boolean `useState` for each — cards bloated to 500+ LOC.
- **Decision.** One `<SheetHost>` mounted at the app root; `useSheet().open(spec)` returns a Promise resolving to the chosen action id (or null).
- **Consequences.** Card components shrink dramatically; dialog state moves out of components. One canonical animation/keyboard-avoidance behaviour. Awaitable flow reads top-to-bottom.
- **Alternatives.** Per-component dialogs (current — the problem), `react-native-modal` directly (loses unified styling/testID conventions).

### ADR-006 — Upload-queue persistence in AsyncStorage, not MMKV
- **Context.** v1 uses AsyncStorage and it works. MMKV is faster but adds a native module + Hermes interop concerns.
- **Decision.** Keep AsyncStorage; debounced 200 ms snapshots; whitelist keys.
- **Consequences.** No new native module. Snapshot writes are O(KB) and async — no measurable jank.
- **Alternatives.** MMKV (rejected for v2 v1; reconsider if profiling shows write contention), SQLite (overkill).

### ADR-007 — Fixture-mode plumbing stays env-var driven
- **Context.** `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE` is inlined by Metro at build time. Existing Maestro + `pnpm ios:mock` workflows depend on it.
- **Decision.** Keep the same flag names and semantics. Centralize reads in `infra/env.ts`. Server-side `USE_FIXTURES` and `FIXTURES_DELAY_MS` unchanged.
- **Consequences.** No change to dev workflow. Server fixtures must do real DB writes (R1 — never stub `updateFileMetadataFn`).
- **Alternatives.** Runtime toggle (rejected: requires server, complicates Maestro), per-test injection (rejected: native side can't see it).

### ADR-008 — Typed `testIds` registry as the only source of testID strings
- **Context.** v1 has no registry; testID renames silently break Maestro flows that grep them out of YAML.
- **Decision.** Single `infra/testIds.ts` exporting branded-string factories; CI cross-checks `.maestro/**/*.yaml` against the registry; component `testID` props accept only `TestId`.
- **Consequences.** Renaming a testID requires updating the registry, which surfaces in CI against Maestro YAML before merge. v1 string values preserved verbatim so existing flows keep passing.
- **Alternatives.** Lint rule on string literals (weaker — doesn't connect to YAML), generated YAML constants (heavier, intrusive on Maestro authors).

### ADR-009 — Two-tier component library; no third tier
- **Context.** v1 has a healthy mix of primitives (`AppDialogSheet`, `AppButton`) and feature components, but a few "almost-shared" components hover between layers.
- **Decision.** `shared/ui/` (primitive, no domain) and `features/<x>/components/` (composed, feature-aware). Promotion to `shared/ui/` requires use by ≥2 features.
- **Consequences.** Avoids speculative abstractions; avoids duplication via the rule-of-two.
- **Alternatives.** Three-tier (rejected: over-engineering at this scale), monolithic component dir (rejected: v1 pain).

### ADR-010 — RFC 4122 UUIDs only, via `crypto.randomUUID()` with `expo-crypto` fallback
- **Context.** Hermes release builds may not expose `globalThis.crypto`; PostgREST 400s silently when sent non-UUID strings into UUID columns (memory: supabase-postgrest).
- **Decision.** `infra/ids.ts` exports `newId()` — `globalThis.crypto?.randomUUID?.() ?? expoRandomUUID()`. Never hand-rolled formats.
- **Consequences.** No silent PostgREST 400s. Standard-path-first compliant.
- **Alternatives.** `nanoid` (rejected: not RFC 4122), hand-rolled `time-rand` (rejected — the bug we're avoiding).