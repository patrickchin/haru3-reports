# v2 Implementation Plan

> Concrete implementation conventions for `apps/mobile-v2/`. Pairs with the
> high-level architecture doc (separate). Optimised for short files, small
> diffs, easy review, and zero ambiguity for new contributors.

---

## 1. Toolchain

Pinned versions. Every choice carries forward from v1 unless explicitly justified.

| Package | Version | Status | Note |
|---|---|---|---|
| `expo` | `~55.0.9` | keep | Same SDK as v1; no upgrade churn during rewrite. |
| `react` / `react-dom` | `19.2.0` / `^19.2.0` | keep | Same React. |
| `react-native` | `0.83.4` | keep | Tied to Expo SDK 55. |
| `expo-router` | `~55.0.8` | keep | File-based routing is non-negotiable. |
| `@tanstack/react-query` | `^5.90.21` | keep | Server state. |
| `zod` | `^4.3.6` | keep | Boundary validation; required by `@harpa/report-core`. |
| `nativewind` | `^4.2.3` | keep | Styling. |
| `tailwindcss` | `^3.4.19` | keep | NW4 still on TW3. |
| `tailwind-merge` | `^3.5.0` | keep | Used by `cn()` helper. |
| `lucide-react-native` | `^0.577.0` | keep | Icons. |
| `react-hook-form` | `^7.54.0` | **add** | Schema-driven forms; replaces hand-rolled `useState`-per-field in `ReportEditForm.tsx`. |
| `@hookform/resolvers` | `^3.9.0` | **add** | Zod adapter. |
| `@supabase/supabase-js` | `^2.99.2` | keep | DB / auth. |
| `expo-file-system` | `^55.0.16` | keep | Blob + NSURLSession. |
| `expo-audio` | `~55.0.14` | keep | Playback + record. |
| `expo-image` | `^55.0.9` | keep | Caching image renderer. |
| `expo-image-manipulator` | `~55.0.15` | keep | Resize / blurhash. |
| `expo-image-picker` | `~55.0.19` | keep |  |
| `expo-document-picker` | `~55.0.13` | keep |  |
| `expo-camera` | `^55.0.18` | keep |  |
| `expo-crypto` | `~55.0.14` | keep | UUIDs (Hermes-safe). |
| `expo-clipboard` | `^55.0.13` | keep |  |
| `expo-linking` | `~55.0.9` | keep | Deep links. |
| `expo-print` / `expo-sharing` | `^55.0.13` / `^55.0.18` | keep | PDF export. |
| `react-native-pdf` | — | **drop** | Use `expo-print` + `expo-sharing` round-trip; drop native PDF viewer dep. We render via WebView/`pdf.js` only on the rare in-app preview path (deferred until needed). |
| `react-native-blob-util` | — | **drop** | Duplicate of `expo-file-system` blob ops; kept v1 in limbo (R-pattern: dual blob libs). One blob lib only. |
| `react-native-webview` | — | **drop** | No live consumers (grep-confirmed dead in v1). |
| `react-native-reanimated` | `4.2.1` | keep | Single source of animation truth. v1's manual `Animated` usage migrates to `Reanimated`. |
| `react-native-gesture-handler` | `~2.30.0` | keep | Required by Reanimated + nav. |
| `clsx` | — | **drop** | `cn()` uses `tailwind-merge` directly (1-line wrapper). |
| `@react-native-async-storage/async-storage` | `^2.2.0` | keep | Upload queue persistence + auth session. |
| `@notifee/react-native` | `^9.1.8` | keep | Android upload foreground service. |

**Dev:**

| Package | Version | Note |
|---|---|---|
| `typescript` | `~5.9.2` | Strict everywhere. |
| `vitest` | `^4.1.4` | Same runner as v1. |
| `@vitest/coverage-v8` | `^4.1.4` |  |
| `jsdom` | `^29.0.2` | DOM env for component tests. |
| `react-test-renderer` | `19.2.0` | Pinned to React. See React-19 act gotchas in `vitest.setup.ts`. |
| `@testing-library/react-native` | `^13.3.3` | Used sparingly; `react-test-renderer` preferred for snapshot/state tests. |
| `eslint` | `^9.13.0` | Flat config. |
| `eslint-plugin-react-hooks` | `^5.0.0` |  |
| `eslint-plugin-import-x` | `^4.3.0` | Faster than `eslint-plugin-import`. |
| `@typescript-eslint/*` | `^8.10.0` |  |
| `prettier` | `^3.3.0` | Default config + `tailwindcss` plugin for class sorting. |
| `prettier-plugin-tailwindcss` | `^0.6.8` |  |
| `knip` | `^5.30.0` | Dead code / dep. |
| `depcheck` | `^1.4.7` | Belt-and-braces. |

---

## 2. Folder Structure

```
apps/mobile-v2/
├── app/                          # expo-router routes only (no business logic)
│   ├── _layout.tsx               # root providers + ErrorBoundary
│   ├── index.tsx                 # auth gate → redirect
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── callback.tsx          # OTP / deep-link return
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── projects.tsx
│   │   └── account.tsx
│   ├── projects/[projectId]/
│   │   ├── _layout.tsx
│   │   ├── index.tsx             # project home
│   │   ├── members.tsx
│   │   └── reports/
│   │       ├── [reportId].tsx
│   │       └── generate.tsx
│   ├── (camera)/capture.tsx
│   └── e2e/login.tsx             # dev-only deep link
├── src/
│   ├── features/                 # domain folders; one per bounded context
│   │   ├── auth/
│   │   │   ├── api/              # query+mutation hooks, supabase calls
│   │   │   ├── components/       # AuthForm.tsx, OtpInput.tsx
│   │   │   ├── hooks/            # useSession.ts
│   │   │   └── lib/              # auth-security.ts
│   │   ├── projects/
│   │   ├── reports/
│   │   │   ├── api/              # useReport.ts, useUpdateReport.ts
│   │   │   ├── components/       # ReportView.tsx, sections/RoleRow.tsx
│   │   │   ├── forms/            # ReportEditForm.tsx + section forms
│   │   │   └── lib/              # report-edit-helpers.ts (verbatim from v1)
│   │   ├── notes/
│   │   ├── voice-notes/
│   │   │   ├── components/       # VoiceNoteCard.tsx (~150 LOC)
│   │   │   ├── dialogs/          # delete.tsx, options.tsx, transcript.tsx
│   │   │   └── playback/         # AudioPlaybackProvider.tsx (verbatim)
│   │   ├── files/
│   │   ├── uploads/              # jobs.ts | queue.ts | uploader.ts (verbatim)
│   │   └── usage/
│   ├── ui/                       # primitives — no domain knowledge
│   │   ├── Button.tsx            # + Button.test.tsx
│   │   ├── Sheet.tsx             # absorbs AppDialogSheet + per-card dialogs
│   │   ├── TextField.tsx
│   │   ├── Select.tsx
│   │   └── icons.ts              # curated lucide re-exports
│   ├── lib/                      # cross-cutting pure modules
│   │   ├── supabase.ts           # singleton client
│   │   ├── query-client.ts       # react-query config
│   │   ├── uuid.ts               # Hermes-safe RFC4122
│   │   ├── design-tokens/        # colors.ts, spacing.ts, typography.ts
│   │   ├── env.ts                # zod-validated EXPO_PUBLIC_* surface
│   │   ├── dev-flags.ts          # fixture-mode flags
│   │   ├── result.ts             # Result<T,E> helper
│   │   └── testIds.ts            # central registry (§12)
│   └── test/
│       ├── setup.ts              # vitest setup; React-19 act helpers
│       └── factories/            # report.ts, project.ts builders
├── assets/
├── package.json
├── app.config.ts
├── tsconfig.json
├── tailwind.config.js
├── eslint.config.mjs
└── vitest.config.ts
```

`@/` resolves to `apps/mobile-v2/src/`. Routes import via `@/features/...`; features may not import from `app/`.

---

## 3. Code Style Rules

Hard, enforced by CI:

- **Max file length: 250 lines.** 400 is a HIGH lint warning. 800 is a hard error.
- **Max function length: 50 lines.** Components > 80 must be split.
- **Max nesting depth: 4.** `eslint max-depth`.
- **Cyclomatic complexity: 10.** `eslint complexity`.
- **Extract a component** when JSX > 60 lines, when it has its own state, or when it's reused.
- **Extract a hook** when a component has > 2 effects, or when state logic is shared by ≥ 2 components.
- **Immutability is mandatory.** No mutation of props, state, params, or imported objects. Enforced by `eslint-plugin-functional/no-mutation` (scoped to `src/features/**` and `src/lib/**`; allowed in `uploads/queue.ts` worker loop with `// justified-deviation: ...`).
- **Named exports only.** No `export default` except where expo-router requires it (route files). Lint rule: `import/no-default-export` with override for `app/**`.
- **Import order** (auto-sorted by `eslint-plugin-import-x`):
  1. Node builtins
  2. External (`react`, `react-native`, `expo-*`, third-party)
  3. Internal (`@harpa/report-core`, `@/...`)
  4. Relative (`./`, `../`)
  5. Type-only imports last in each group, prefixed `import type`.
- **Path alias:** single `@/` → `src/` in `tsconfig.json` `paths` and `babel.config.js` `module-resolver`. No deep relative paths (`../../../`) — lint rule blocks more than `../`.

---

## 4. Component Conventions

Three tiers: **route** (in `app/`), **feature** (in `src/features/<domain>/components/`), **primitive** (in `src/ui/`).

### Route — `app/(auth)/callback.tsx`

```tsx
import { useEffect } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useExchangeOtp } from "@/features/auth/api/useExchangeOtp";
import { testIds } from "@/lib/testIds";

export default function AuthCallback() {
  const { token, type } = useLocalSearchParams<{ token?: string; type?: string }>();
  const exchange = useExchangeOtp();

  useEffect(() => {
    if (!token || !type) return;
    exchange.mutate(
      { token, type },
      { onSuccess: () => router.replace("/(tabs)/projects") },
    );
  }, [token, type, exchange]);

  return (
    <View className="flex-1 items-center justify-center" testID={testIds.auth.callback}>
      <ActivityIndicator />
    </View>
  );
}
```

### Feature — `src/features/projects/components/ProjectListItem.tsx`

```tsx
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "@/ui/icons";

import { testIds } from "@/lib/testIds";
import type { Project } from "../api/types";

interface Props {
  project: Project;
  onPress: (id: string) => void;
}

export function ProjectListItem({ project, onPress }: Props) {
  return (
    <Pressable
      onPress={() => onPress(project.id)}
      className="flex-row items-center gap-3 border-b border-muted px-4 py-3"
      testID={testIds.projects.item(project.id)}
    >
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground">{project.name}</Text>
        {project.address ? (
          <Text className="text-sm text-muted-foreground">{project.address}</Text>
        ) : null}
      </View>
      <ChevronRight size={18} className="text-muted-foreground" />
    </Pressable>
  );
}
```

### Primitive — `src/ui/Button.tsx`

```tsx
import { Pressable, Text, ActivityIndicator } from "react-native";
import { cn } from "@/lib/cn";

type Variant = "default" | "secondary" | "destructive" | "quiet";

const VARIANTS: Record<Variant, { box: string; text: string }> = {
  default:     { box: "bg-primary",            text: "text-primary-foreground" },
  secondary:   { box: "bg-secondary",          text: "text-secondary-foreground" },
  destructive: { box: "bg-destructive",        text: "text-destructive-foreground" },
  quiet:       { box: "bg-transparent",        text: "text-foreground" },
} as const;

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function Button({ label, onPress, variant = "default", loading, disabled, testID }: Props) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      className={cn("h-11 items-center justify-center rounded-lg px-4", v.box, isDisabled && "opacity-50")}
    >
      {loading ? <ActivityIndicator color="white" /> : <Text className={cn("text-base font-medium", v.text)}>{label}</Text>}
    </Pressable>
  );
}
```

---

## 5. Hook Conventions

One hook per file. Filename matches export. Exhaustive-deps strictly enforced.

### Query hook — `src/features/reports/api/useReport.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/lib/supabase";
import { ReportRow } from "./schemas";

export const reportKey = (id: string) => ["report", id] as const;

export function useReport(reportId: string) {
  return useQuery({
    queryKey: reportKey(reportId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_reports").select("*").eq("id", reportId).single();
      if (error) throw error;
      return ReportRow.parse(data); // unknown → typed at boundary
    },
    enabled: Boolean(reportId),
    staleTime: 30_000,
  });
}
```

### Mutation hook with optimistic merge + invalidation (R11) — `useUpdateReport.ts`

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { reportKey } from "./useReport";
import type { Report, ReportPatch } from "./types";

export function useUpdateReport(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ReportPatch) => {
      const { error } = await supabase.from("site_reports").update(patch).eq("id", reportId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: reportKey(reportId) });
      const prev = qc.getQueryData<Report>(reportKey(reportId));
      if (prev) qc.setQueryData<Report>(reportKey(reportId), { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(reportKey(reportId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: reportKey(reportId) }),
  });
}
```

### Pure state-machine hook — `useDialogState.ts`

```ts
import { useReducer } from "react";

export type DialogState =
  | { kind: "closed" }
  | { kind: "delete"; targetId: string }
  | { kind: "options"; targetId: string }
  | { kind: "transcript"; targetId: string; text: string };

type Action =
  | { type: "open"; state: Exclude<DialogState, { kind: "closed" }> }
  | { type: "close" };

const reduce = (_s: DialogState, a: Action): DialogState =>
  a.type === "close" ? { kind: "closed" } : a.state;

export function useDialogState() {
  const [state, dispatch] = useReducer(reduce, { kind: "closed" } as DialogState);
  return {
    state,
    open: (s: Exclude<DialogState, { kind: "closed" }>) => dispatch({ type: "open", state: s }),
    close: () => dispatch({ type: "close" }),
  };
}
```

---

## 6. Form Pattern

Solves v1's `ReportEditForm.tsx` (705 LOC) and `EditTabPane.tsx`. Three rules:

1. **`react-hook-form` + zodResolver** for every form. Reuse the schemas from `@harpa/report-core`.
2. **Section components** receive a `useFormContext()`-bound `control` — never the entire report.
3. **Row arrays** use `useFieldArray` so each `RoleRow` only re-renders on its own changes.

### Skeleton — `features/reports/forms/ReportEditForm.tsx` (target < 200 LOC)

```tsx
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ScrollView } from "react-native";

import { GeneratedSiteReportSchema, type GeneratedSiteReport } from "@harpa/report-core";
import { useUpdateReport } from "../api/useUpdateReport";
import { MetaSection } from "./sections/MetaSection";
import { WeatherSection } from "./sections/WeatherSection";
import { RolesSection } from "./sections/RolesSection";
import { MaterialsSection } from "./sections/MaterialsSection";
import { IssuesSection } from "./sections/IssuesSection";
import { Button } from "@/ui/Button";
import { useConfirm } from "@/ui/useConfirm";

interface Props { reportId: string; initial: GeneratedSiteReport; }

export function ReportEditForm({ reportId, initial }: Props) {
  const form = useForm<GeneratedSiteReport>({
    defaultValues: initial,
    resolver: zodResolver(GeneratedSiteReportSchema),
    mode: "onBlur",
  });
  const update = useUpdateReport(reportId);
  const confirm = useConfirm();

  const onSubmit = form.handleSubmit(async (values) => {
    if (!(await confirm.askDestructive("Save changes?"))) return;
    update.mutate({ payload: values });
  });

  return (
    <FormProvider {...form}>
      <ScrollView className="flex-1 px-4 py-3">
        <MetaSection />
        <WeatherSection />
        <RolesSection />        {/* useFieldArray inside */}
        <MaterialsSection />    {/* useFieldArray inside */}
        <IssuesSection />       {/* useFieldArray inside */}
        <Button label="Save" onPress={onSubmit} loading={update.isPending} />
      </ScrollView>
    </FormProvider>
  );
}
```

Each `*Section.tsx` is < 80 LOC, owns its slice via `useFormContext`. Validation errors surface inline via `useController`'s `fieldState.error`. Destructive confirmations route through `useConfirm()` (see §7) — never inline `Alert.alert`.

---

## 7. Dialog / Sheet Pattern

One primitive `<Sheet>` in `src/ui/Sheet.tsx` replaces v1's `AppDialogSheet` AND every per-card inline dialog. Two consumption modes:

**Mode A — declarative (preferred for static dialogs):**

```tsx
<Sheet
  open={dialog.state.kind === "delete"}
  onClose={dialog.close}
  tone="danger"
  title="Delete Voice Note"
  message="This cannot be undone."
  primary={{ label: "Delete", variant: "destructive", onPress: handleDelete }}
  secondary={{ label: "Cancel", onPress: dialog.close }}
  testID={testIds.voiceNote.deleteSheet}
/>
```

**Mode B — imperative (for confirm-and-await flows in mutations):**

```tsx
const confirm = useConfirm();
if (!(await confirm.askDestructive({ title: "Delete file?", body: "..." }))) return;
```

`useConfirm()` is a thin wrapper over a top-level `<ConfirmProvider>` mounted in `app/_layout.tsx`. It returns a Promise — eliminates the "5 booleans for 5 dialogs" anti-pattern.

### `VoiceNoteCard.tsx` shrinks from ~590 → ~150 LOC

```tsx
export function VoiceNoteCard({ note }: { note: VoiceNote }) {
  const dialog = useDialogState();              // discriminated union, §5
  const player = useScopedPlayer(note.audioUrl);
  const del = useDeleteVoiceNote(note.id);

  return (
    <View testID={testIds.voiceNote.card(note.id)}>
      <PlaybackBar player={player} />
      <TranscriptPreview text={note.transcript} onExpand={() => dialog.open({ kind: "transcript", targetId: note.id, text: note.transcript ?? "" })} />
      <CardActions
        onDelete={() => dialog.open({ kind: "delete", targetId: note.id })}
        onMore={() => dialog.open({ kind: "options", targetId: note.id })}
      />
      <VoiceNoteDialogs state={dialog.state} close={dialog.close} onConfirmDelete={() => del.mutate()} />
    </View>
  );
}
```

`VoiceNoteDialogs` is a tiny dispatcher (~40 LOC) that renders one of three `<Sheet>` instances based on `state.kind`. No conditional `&&` ladders, no boolean state explosion.

---

## 8. Upload Queue Port

Keep the v1 three-file split verbatim in shape. Public surface unchanged so call sites don't churn.

`src/features/uploads/jobs.ts` — pure reducer. **Copy verbatim** from v1.

`src/features/uploads/queue.ts` — runtime. **Copy with these simplifications:**

- Drop the `react-native-blob-util` branch in `uriToBlob`. Single path: `expo-file-system` + `Blob` via `fetch(uri).then(r => r.blob())`. (Standard-path-first: `fetch()` returns a Blob natively in RN 0.83.)
- Drop the dual UUID code paths; route through `@/lib/uuid` only.
- Move persistence debounce default from 200ms → 250ms (single source of truth in `lib/env.ts`).

`src/features/uploads/uploader.ts` — orchestration. **Copy verbatim**, drop the v1 image-preprocess fallback that called both `expo-image-manipulator` and a manual canvas; only the manipulator path remains.

Public API (unchanged):

```ts
export interface UploadQueue {
  subscribe(listener: () => void): () => void;
  getJobs(): UploadJob[];
  getJob(jobId: string): UploadJob | undefined;
  enqueueUpload(input: EnqueueInput): string;
  cancelUpload(jobId: string): void;
  retryUpload(jobId: string): void;
  hydrate(): Promise<void>;
  waitForIdle(): Promise<void>;
}
export function getUploadQueue(): UploadQueue;
export function createUploadQueue(deps: UploadQueueDeps): UploadQueue;
```

Hook: `useUploadJobs()` subscribes via `useSyncExternalStore` (single re-render path; no manual listener juggling).

---

## 9. Audio Playback Port

Keep v1's screen-scoped provider. Simplifications:

- Drop the legacy `expo-av` fallback path; `expo-audio` only.
- Replace v1's "manual unmount on pathname change" with an `<AudioPlaybackProvider>` mounted inside `(tabs)` and report-detail layouts only — natural unmount-on-route-change.
- Listener-driven (no polling) — kept verbatim.

Public API:

```ts
export function useScopedPlayer(uri: string | null): {
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  positionMs: number;
  durationMs: number;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
};
```

`AudioPlaybackProvider.tsx` stays ~450 LOC — that complexity is intrinsic (audio session, ducking, interrupts). Don't split for the sake of it.

---

## 10. Testing Conventions

**Layers:**

| Layer | Tool | Where | When |
|---|---|---|---|
| Unit (pure) | vitest (node env) | next to source | every pure module — required |
| Component | vitest + jsdom + react-test-renderer | `Foo.test.tsx` next to `Foo.tsx` | every primitive + every feature component with branching |
| Hook | vitest + jsdom + `@testing-library/react-native` `renderHook` | next to hook | every mutation hook (optimistic path) |
| RLS | deno + real Postgres | `supabase/tests/rls_*.test.ts` | any change to a table read/write/delete path (mandatory; see AGENTS.md) |
| Maestro E2E | maestro | `apps/mobile-v2/.maestro/` | every critical flow + any testID rename |

**Colocation rule:** `Foo.tsx` and `Foo.test.tsx` live in the same directory. No `__tests__/` mirror trees.

**`src/test/setup.ts` inherits from v1, with React-19 fixes baked in:**

```ts
import "@testing-library/jest-dom";
import { vi } from "vitest";
// DO NOT set globalThis.IS_REACT_ACT_ENVIRONMENT = true — see /memories react19-testing.md
vi.mock("expo-router", () => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));
```

`src/test/act-helpers.ts` exports `createTree()` — wraps `create()` in synchronous `act()` (NOT `await act(async ...)` which hangs in vitest node env). Use this in every component test.

**Mock policy:**

- **Mock:** the network boundary (`supabase.from(...)`), platform side-effects (`AsyncStorage`, `expo-file-system`), navigation (`router`).
- **Do not mock:** pure helpers, reducers, schemas, design tokens, the upload `jobs.ts` reducer.
- **Never mock the I/O primitive being changed** (per repo rules) — use a fixture instead.

**RLS test rule (mandatory, from AGENTS.md):** Any change that affects how the client reads/writes/deletes a Postgres table — including new mobile code paths that hit a different table, soft-delete flips, new RPCs, or relaxed/tightened policies — ships with a matching test in `supabase/tests/rls_*.test.ts`. Mocked client tests do not exercise RLS. See [supabase/tests/README.md](supabase/tests/README.md).

**Maestro:** smoke flow per route in `app/`; every dialog used in a destructive path must appear in at least one Maestro flow.

---

## 11. TypeScript Discipline

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`.
- **No `any`.** Lint rule `@typescript-eslint/no-explicit-any: error`. Required justification comment if used: `// justified-deviation: <reason>`.
- **`unknown` at every boundary**, narrowed via zod parse: PostgREST responses, AsyncStorage reads, deep-link params, `JSON.parse`. Never `as Foo` an external value.
- **Discriminated unions** for any state with > 2 distinct shapes (dialogs, upload jobs, async state). No "`isLoading: boolean` + `data?: T` + `error?: E`" tuples.
- **`as const`** for testIds, design tokens, route names, query-key prefixes.
- **No enums.** Use `as const` object + derived union type.
- **`type` over `interface`** except for object shapes that are explicitly extension points (component `Props`).
- **Branded types** for `ProjectId`, `ReportId`, `FileId` to prevent cross-id mix-ups in mutation hooks.

---

## 12. TestIds Registry

Single typed registry — fixes v1's "rename testID, silently break Maestro" risk.

`src/lib/testIds.ts`:

```ts
export const testIds = {
  auth: {
    callback: "auth-callback",
    loginSubmit: "btn-auth-login-submit",
    otpInput: "input-auth-otp",
  },
  projects: {
    list: "screen-projects-list",
    item: (id: string) => `project-item-${id}` as const,
    fabNew: "btn-projects-new",
  },
  voiceNote: {
    card: (fileId: string) => `voice-note-card-${fileId}` as const,
    deleteSheet: "sheet-voice-note-delete",
    optionsSheet: "sheet-voice-note-options",
    transcriptSheet: "sheet-voice-note-transcript",
  },
  uploads: {
    pendingPhoto: (localId: string) => `pending-photo-${localId}` as const,
  },
} as const;
```

**Migration rule for Maestro YAML:** Maestro flows reference IDs through generated constants checked into [.maestro/ids.ts](apps/mobile-v2/.maestro/ids.ts), produced by a `scripts/gen-maestro-ids.ts` step at `pretest:e2e`. Renaming a testID in `testIds.ts` → regen → diff in YAML is one-line. CI fails if YAML references an ID not present in the registry.

---

## 13. Linting / Formatting

`eslint.config.mjs` (flat config), composed of:

- `@eslint/js` recommended
- `typescript-eslint` strict + stylistic
- `eslint-plugin-react`, `eslint-plugin-react-hooks` (exhaustive-deps: error)
- `eslint-plugin-import-x` (order, no-default-export, no-cycle)
- `eslint-plugin-functional` (no-mutation, scoped to `src/features/**` and `src/lib/**`)
- `eslint-plugin-unicorn` (curated)

Critical custom rules:

```js
// no-restricted-imports — enforce standard-path-first.md
"no-restricted-imports": ["error", {
  paths: [
    { name: "react-native-blob-util", message: "Use expo-file-system / fetch().blob()" },
    { name: "react-native-webview",   message: "No WebView in v2 unless approved" },
    { name: "clsx",                   message: "Use @/lib/cn (tailwind-merge)" },
  ],
  patterns: ["../../*", "../../../*"], // force @/ alias
}],

// no-restricted-syntax — banned patterns from standard-path-first.md
"no-restricted-syntax": ["error",
  { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: "Use crypto / @/lib/uuid for IDs/tokens" },
  { selector: "CallExpression[callee.name='atob']", message: "Use Blob/fetch for binary" },
  { selector: "CallExpression[callee.name='btoa']", message: "Use Blob/fetch for binary" },
],
```

`.prettierrc.json`: defaults + `"plugins": ["prettier-plugin-tailwindcss"]`, `"printWidth": 100`.

**Knip** (`knip.json`) wired to fail CI on unused exports/files/deps. **Depcheck** as a redundant safety net for missing/unused deps in `package.json`.

---

## 14. Build / Dev Scripts

```jsonc
{
  "scripts": {
    "start": "expo start --dev-client",
    "ios": "expo run:ios",
    "ios:mock": "EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true expo run:ios",
    "ios:mock:release": "EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true expo run:ios --configuration Release",
    "android": "expo run:android",
    "android:mock": "EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=true expo run:android",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "maestro test .maestro/",
    "knip": "knip",
    "depcheck": "depcheck",
    "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm knip"
  }
}
```

**`EXPO_PUBLIC_*` rebuild requirement:** flipping any `EXPO_PUBLIC_*` env var requires a fresh native build (Metro inlines at bundle time). Documented in [apps/mobile-v2/README.md](apps/mobile-v2/README.md). The `:mock` scripts exist precisely to make the flag-bake explicit.

---

## 15. CI Hooks

**Pre-commit** (husky + lint-staged):

- `tsc --noEmit` on changed packages (turbo-affected)
- `eslint --fix` + `prettier --write` on staged files
- Vitest run on files affected by staged changes (`vitest related --run`)

**Pre-push:**

- Full `pnpm verify` (typecheck + lint + test + knip)
- `depcheck`

**PR (GitHub Actions):**

- Reuse repo's existing pipeline: typecheck, lint, vitest, knip, RLS tests
- **New job:** Maestro smoke (`apps/mobile-v2`) on a single critical flow (login → projects → create draft → add voice note). Runs on macOS runner. Required for merge to `dev`.
- Deno test for any edge function touched.

---

## 16. Migration Aids

### Copy verbatim (zero or trivial diff)

| v1 path | v2 path |
|---|---|
| [apps/mobile/lib/uploads/jobs.ts](apps/mobile/lib/uploads/jobs.ts) | `src/features/uploads/jobs.ts` |
| [apps/mobile/lib/uploads/uploader.ts](apps/mobile/lib/uploads/uploader.ts) | `src/features/uploads/uploader.ts` (drop dual-blob fallback) |
| [apps/mobile/lib/report-edit-helpers.ts](apps/mobile/lib/report-edit-helpers.ts) | `src/features/reports/lib/report-edit-helpers.ts` |
| [apps/mobile/lib/app-dialog-copy.ts](apps/mobile/lib/app-dialog-copy.ts) | `src/lib/dialog-copy.ts` (already uses generic `destructive()` preset) |
| [apps/mobile/lib/design-tokens/colors.ts](apps/mobile/lib/design-tokens/colors.ts) | `src/lib/design-tokens/colors.ts` |
| [apps/mobile/lib/auth-security.ts](apps/mobile/lib/auth-security.ts) | `src/features/auth/lib/auth-security.ts` |
| [apps/mobile/lib/uuid.ts](apps/mobile/lib/uuid.ts) | `src/lib/uuid.ts` (Hermes fallback intact) |
| [apps/mobile/lib/dev-flags.ts](apps/mobile/lib/dev-flags.ts) | `src/lib/dev-flags.ts` |
| [apps/mobile/lib/voice-note-flow.ts](apps/mobile/lib/voice-note-flow.ts) | `src/features/voice-notes/lib/voice-note-flow.ts` |
| [apps/mobile/lib/audio/AudioPlaybackProvider.tsx](apps/mobile/lib/audio/AudioPlaybackProvider.tsx) | `src/features/voice-notes/playback/AudioPlaybackProvider.tsx` (drop expo-av branch) |
| [apps/mobile/lib/uploads/queue.ts](apps/mobile/lib/uploads/queue.ts) | `src/features/uploads/queue.ts` (drop blob-util branch) |
| All Maestro flows under `apps/mobile/.maestro/` | `apps/mobile-v2/.maestro/` (regen IDs through `testIds`) |
| RLS tests under `supabase/tests/rls_*.test.ts` | unchanged (live in `supabase/`, not per-app) |

### Adapt (rewrite shape, keep logic)

| v1 path | Action |
|---|---|
| `components/reports/ReportEditForm.tsx` (~800 LOC) | Split into `forms/ReportEditForm.tsx` + 6 `sections/*.tsx` + `useFieldArray` rows. Use react-hook-form. Target < 200 LOC top-level. |
| `components/reports/EditTabPane.tsx` (~400 LOC) | Becomes a thin wrapper around `ReportEditForm`; tab switching moves to route. |
| `components/voice-notes/VoiceNoteCard.tsx` (~590 LOC) | Apply `useDialogState` + `<Sheet>`; extract `PlaybackBar`, `TranscriptPreview`, `CardActions`, `VoiceNoteDialogs`. Target ~150 LOC. |
| `components/files/FileCard.tsx` (~480 LOC) | Same recipe as VoiceNoteCard. Target ~150 LOC. |
| `components/notes/NoteTimeline.tsx` | Extract pending-row bridge to `useTimelineWithPending()` hook. |
| `lib/auth.tsx` | Split into `useSession()` hook + `<SessionProvider>` + `api/` mutations. |
| `hooks/useLocal*.ts` (all) | Re-implement against the new query-key conventions in `features/<domain>/api/`. Same SQL, smaller hook bodies. |
| `lib/file-upload.ts` types | Move into `features/uploads/types.ts`. |

### Discard

| v1 path | Reason |
|---|---|
| `react-native-blob-util` usages | Single blob lib. |
| `react-native-webview` usages | Dead. |
| Any `clsx` import | Use `cn` from `tailwind-merge`. |
| Manual `Animated` usage in components | Use Reanimated 4 worklets. |
| `react-native-pdf` integration | Replaced by `expo-print` + `expo-sharing`. |
| Per-card boolean dialog `useState` ladders | Replaced by `useDialogState` discriminated union. |
| `Alert.alert` calls (none should exist; per AGENTS.md) | Use `<Sheet>` / `useConfirm`. |
| Ad-hoc `JSON.parse(x) as T` | Replaced by zod parse at boundary. |
| `Math.random()`-based local IDs (if any) | Routed through `@/lib/uuid`. |

---

**End of v2 implementation plan.** Pair with the architecture doc for system-level decisions (data flow, sync strategy, offline posture, edge-function contracts).