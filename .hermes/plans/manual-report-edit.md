# Manual Report Edit — Implementation Plan

> **For Hermes:** Implement task-by-task with right-sized subagents.
> Sequential between commits (each lands a stable contract); within Commit 2, parallel across disjoint card files.
> Iteration cap is 300 — leave headroom (~120 calls/subagent).

**Goal:** Allow the user to manually type-edit every part of a generated site report (meta, weather, workers, materials, issues, next steps, sections) as a backup to voice notes — useful when the LLM mishears names, technical terms, or numbers.

**Architecture:**
- **Per-card local edit state** (`isEditing` + draft inside each card). No parent-side `editingIndex` state machine — that pattern was deliberately removed before; don't re-introduce it.
- **Pure immutable helpers** in `lib/report-edit-helpers.ts` (`updateMeta`, `setRoles`, `blankRole()`, …) for slice patches. Already documented in the `haru3-reports` skill.
- **Reusable `EditableField` primitive** for one-line + multiline TextInput affordance (Pencil → input + Check). Shared by every card.
- **`useReportAutoSave` hook** (debounced 1.5s + flush on blur/AppState background) for the saved-report screen. The generate screen already has its own `setReport` — autosave is for the saved/persisted screen only.
- **Edit/Done toggle** in saved-report header drives `isEditing` → renders cards with `editable` prop. Generate screen always allows edits (already does for sections).

**Tech stack:** React Native + Expo, Vitest, react-test-renderer, TanStack Query, local SQLite (via `useLocalReportMutations`).

---

## Sizing & dispatch strategy

| Commit | Files | Tool-call estimate | Dispatch |
|---|---|---|---|
| 1 | `report-edit-helpers.ts` + `EditableField.tsx` + tests | ~60 | 1 subagent |
| 2a | `WorkersCard`, `MaterialsCard` (+ tests) | ~80 | 1 subagent (parallel w/ 2b, 2c) |
| 2b | `IssuesCard`, `NextStepsCard` (+ tests) | ~80 | 1 subagent (parallel w/ 2a, 2c) |
| 2c | `SummarySectionCard` refactor + new `MetaEditCard`, `WeatherStrip` editable (+ tests) | ~100 | 1 subagent (parallel w/ 2a, 2b) |
| 2-final | `ReportView` + `generate.tsx` wire-up + integration test | ~80 | sequential after 2a/b/c |
| 3 | `useReportAutoSave` hook + tests | ~80 | 1 subagent |
| 4 | `[reportId].tsx` edit-mode wiring + integration test + docs | ~100 | 1 subagent (sequential after 3) |

Rule applied: any subagent budget **>150 calls = split**. Parallel only across disjoint files importing an already-landed contract (Commit 1's `EditableField`).

---

## Commit 1 — primitives

**Branch:** already on `feat/manual-report-edit`.

### Task 1.1: `lib/report-edit-helpers.ts`

**Files:**
- Create: `apps/mobile/lib/report-edit-helpers.ts`
- Create: `apps/mobile/lib/report-edit-helpers.test.ts`

**Contract** (referenced by every later commit, so this is the linchpin):

```ts
import type {
  GeneratedSiteReport,
  GeneratedReportMeta,
  GeneratedReportWeather,
  GeneratedReportWorkers,
  GeneratedReportRole,
  GeneratedReportMaterial,
  GeneratedReportIssue,
  GeneratedReportSection,
} from "./generated-report";

// Slice patches — return a NEW GeneratedSiteReport (top-level + .report identity changes)
export function updateMeta(r: GeneratedSiteReport, patch: Partial<GeneratedReportMeta>): GeneratedSiteReport;
export function updateWeather(r: GeneratedSiteReport, patch: Partial<GeneratedReportWeather> | null): GeneratedSiteReport;
// `null` clears slice. Partial patch on null slice seeds an empty shape with the patch overlaid.
export function updateWorkers(r: GeneratedSiteReport, patch: Partial<GeneratedReportWorkers> | null): GeneratedSiteReport;

// Whole-array setters
export function setRoles(r: GeneratedSiteReport, roles: GeneratedReportRole[]): GeneratedSiteReport;
export function setMaterials(r: GeneratedSiteReport, materials: GeneratedReportMaterial[]): GeneratedSiteReport;
export function setIssues(r: GeneratedSiteReport, issues: GeneratedReportIssue[]): GeneratedSiteReport;
export function setNextSteps(r: GeneratedSiteReport, steps: string[]): GeneratedSiteReport;
export function setSections(r: GeneratedSiteReport, sections: GeneratedReportSection[]): GeneratedSiteReport;

// Factories for "Add row" buttons. Required string fields = "" (cards must validate before commit).
// Nullable fields start as null.
export function blankRole(): GeneratedReportRole;
export function blankMaterial(): GeneratedReportMaterial;
export function blankIssue(): GeneratedReportIssue;
export function blankSection(): GeneratedReportSection;
```

**Implementation note:** Read `apps/mobile/lib/generated-report.ts` first to get exact field names. `updateWorkers(r, null)` should result in `report.workers = null`. Partial patch on null seeds defaults: `{ totalWorkers: null, roles: [], workerHours: null, notes: null }` then overlays.

**Tests** (TDD): cover each helper for identity-change + correctness + null/partial/seed behaviours. Aim for 12–15 tests.

**Verify:**
```bash
cd apps/mobile && pnpm exec vitest run lib/report-edit-helpers.test.ts
```

**Commit:** `feat(mobile): add report-edit-helpers immutable kit`

### Task 1.2: `EditableField` primitive

**Files:**
- Create: `apps/mobile/components/reports/EditableField.tsx`
- Create: `apps/mobile/components/reports/EditableField.test.tsx`

**Props:**

```ts
interface EditableFieldProps {
  value: string;
  onChange: (next: string) => void;        // committed value; called on Check / blur
  editable?: boolean;                       // when false, renders as plain Text
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;                        // keyboardType="number-pad" + onChange parses string
  textClassName?: string;                   // tailwind for display Text and TextInput
  emptyDisplay?: string;                    // shown when value is "" and not editing (e.g. "—")
  testID?: string;                          // applied to the Pressable wrapper; "<testID>-input" on TextInput; "<testID>-save" on save button
  accessibilityLabel?: string;
}
```

**Behaviour:**
- When `editable=false`: render a plain `<Text>` with `value || emptyDisplay`.
- When `editable=true` and not in edit mode: tappable `<Pressable>` showing value + tiny pencil affordance. Long-press also enters edit mode.
- In edit mode: `<TextInput>` with local draft state, autoFocus, blurOnSubmit, returnKeyType=`done` (single-line) or default (multiline). A small Check icon (or "Done" link) commits via `onChange` and exits edit mode.
- Blur (tap outside / dismiss keyboard) **also commits** — this is the autosave pathway.
- Escape via Cancel? — **No.** Single commit path keeps the model simple. If they make a typo, they re-edit.

**Tests** (vitest, react-test-renderer; lift `onChangeMock = vi.fn()` to module scope per skill):
- Renders plain text when not editable.
- Tap enters edit mode (TextInput appears with current value).
- Typing updates draft; Check button calls `onChange(draft)`.
- Blur calls `onChange(draft)`.
- `emptyDisplay` shown when value is `""` and not editing.
- `numeric` mode passes `keyboardType="number-pad"`.

**Verify:**
```bash
cd apps/mobile && pnpm exec vitest run components/reports/EditableField.test.tsx
```

**Commit:** `feat(mobile): add EditableField primitive for inline manual edits`

---

## Commit 2 — editable cards (parallel within commit)

**Pre-condition:** Commit 1 landed. Subagents 2a/2b/2c run in parallel — they touch disjoint files and only depend on `report-edit-helpers` + `EditableField` (already on disk).

**Shared contract for every card:**

```ts
// Old:
interface XCardProps { workers: GeneratedReportWorkers | null }
// New:
interface XCardProps {
  workers: GeneratedReportWorkers | null;
  editable?: boolean;
  onChange?: (patch: Partial<GeneratedReportWorkers> | null) => void;  // slice patch
}
```

**The card never spreads or mutates — it calls `onChange(patch)` and the parent feeds it through `updateX` from helpers.**

When `editable=true`, every text field becomes an `EditableField`, and lists (roles, materials, issues, steps) gain:
- A trash icon next to each row → calls `onChange` with the row removed.
- An "Add row" button at the bottom → calls `onChange` with `[...rows, blankX()]` appended.

When `editable=false` and a section is empty (e.g. no workers, no issues), the card still returns `null` (existing behaviour). When `editable=true`, even empty sections render with the "Add row" button so the user can populate from scratch.

### Task 2a: WorkersCard + MaterialsCard

**Files:**
- Modify: `apps/mobile/components/reports/WorkersCard.tsx`
- Modify: `apps/mobile/components/reports/MaterialsCard.tsx`
- Create: `apps/mobile/components/reports/WorkersCard.test.tsx`
- Create: `apps/mobile/components/reports/MaterialsCard.test.tsx`

**WorkersCard** edit affordances:
- `totalWorkers` (numeric `EditableField`)
- `workerHours` (one-line `EditableField`)
- `notes` (multiline `EditableField`)
- Each `role`: `role` name (one-line) + `count` (numeric) + trash button
- "Add role" button → `setRoles(r, [...roles, blankRole()])` (parent does this; card calls `onChange({ roles: [...roles, blankRole()] })`)

**MaterialsCard** edit affordances:
- Each material: `name`, `quantity`, `quantityUnit`, `status`, `condition`, `notes` — all one-line `EditableField` except `notes` (multiline). Trash button.
- "Add material" button.
- Pass `onChange={(materials) => onChange?.(materials)}` — but materials is `setMaterials` style (whole array setter), so the prop here is `onChange?: (next: GeneratedReportMaterial[]) => void`. Match it to the `set*` helper, not the slice patch helper.

**Tests** (≥4 per card): renders read-only by default; renders inputs when editable; editing a field calls `onChange` with patched value; "Add" button appends `blank*()`; trash removes the row.

### Task 2b: IssuesCard + NextStepsCard

**Files:**
- Modify: `apps/mobile/components/reports/IssuesCard.tsx`
- Modify: `apps/mobile/components/reports/NextStepsCard.tsx`
- Create: `apps/mobile/components/reports/IssuesCard.test.tsx`
- Create: `apps/mobile/components/reports/NextStepsCard.test.tsx`

**IssuesCard** edit affordances:
- Each issue: `title`, `description`, `severity` (one-line — accept free text for now; severity ramp will still apply via `getIssueSeverityTone`), `category`, `notes`. Trash button. "Add issue" button.
- `onChange?: (next: GeneratedReportIssue[]) => void`

**NextStepsCard** edit affordances:
- Each step: one-line `EditableField`. Trash button. "Add step" button.
- `onChange?: (next: string[]) => void`

**Tests:** same pattern as 2a.

### Task 2c: SummarySectionCard refactor + Meta + Weather

**Files:**
- Modify: `apps/mobile/components/reports/SummarySectionCard.tsx`  ← **breaking prop change**
- Modify: `apps/mobile/components/reports/WeatherStrip.tsx`
- Create: `apps/mobile/components/reports/MetaEditCard.tsx` (NEW — takes `meta: GeneratedReportMeta` and exposes `summary` + any other meta fields as EditableFields when editable)
- Create: `apps/mobile/components/reports/SummarySectionCard.test.tsx` (or extend existing)
- Create: `apps/mobile/components/reports/WeatherStrip.test.tsx`
- Create: `apps/mobile/components/reports/MetaEditCard.test.tsx`

**SummarySectionCard prop refactor — drop the parent-coordinated edit state machine:**

Old:
```ts
interface SummarySectionCardProps {
  section: GeneratedReportSection;
  index: number;
  editable?: boolean;
  isEditing?: boolean;
  editingContent?: string;
  onEditStart?: (index: number) => void;
  onEditChange?: (content: string) => void;
  onEditSave?: () => void;
}
```

New:
```ts
interface SummarySectionCardProps {
  section: GeneratedReportSection;
  index: number;
  editable?: boolean;
  onChange?: (next: GeneratedReportSection) => void;
  onRemove?: () => void;
}
```

The card uses `EditableField` internally for `title` and `content`. No `editingIndex` from the parent. **All call sites must update in this same commit** (see Commit 2-final).

**WeatherStrip** edit affordances:
- `temperature` (numeric), `condition`, `wind`, `notes` — `EditableField` each.
- `onChange?: (patch: Partial<GeneratedReportWeather> | null) => void`
- "Clear weather" button when editable (passes `null`).

**MetaEditCard:**
- Renders only when `editable=true`. Read-only mode is handled by the existing Summary block in `ReportView` (which already shows `meta.summary`). When editable, `MetaEditCard` lets the user edit `summary` (multiline), `siteName`, `dateLabel`, etc. — read `generated-report.ts` for the full meta shape.
- `onChange?: (patch: Partial<GeneratedReportMeta>) => void`

### Task 2-final: ReportView + generate.tsx wire-up

**Sequential** — runs only after 2a/2b/2c land.

**Files:**
- Modify: `apps/mobile/components/reports/ReportView.tsx`
- Modify: `apps/mobile/app/projects/[projectId]/reports/generate.tsx`
- Create: `apps/mobile/__tests__/report-view-editable.test.tsx`

**ReportView prop change:**

Old (current):
```ts
interface ReportViewProps {
  report: GeneratedSiteReport;
  editable?: boolean;
  editingIndex?: number | null;
  editingContent?: string;
  onEditStart?: (index: number) => void;
  onEditChange?: (content: string) => void;
  onEditSave?: () => void;
}
```

New:
```ts
interface ReportViewProps {
  report: GeneratedSiteReport;
  editable?: boolean;
  onReportChange?: (next: GeneratedSiteReport) => void;  // full new wrapper
}
```

When `editable && onReportChange`, ReportView passes `editable` + section-specific `onChange` to each card, composing through helpers:

```ts
<WorkersCard
  workers={report.report.workers}
  editable={editable}
  onChange={(patch) => onReportChange?.(updateWorkers(report, patch))}
/>
<MaterialsCard
  materials={report.report.materials}
  editable={editable}
  onChange={(next) => onReportChange?.(setMaterials(report, next))}
/>
// …etc
{editable ? (
  <MetaEditCard meta={report.report.meta} onChange={(patch) => onReportChange?.(updateMeta(report, patch))} />
) : null}
```

**generate.tsx wire-up:**
- Remove `editingIndex`, `setEditingIndex`, `editingContent`, `setEditingContent`, `startEditing`, the `setReport` block at line ~573 that manually patches sections.
- Pass `editable={true}` + `onReportChange={setReport}` to `<ReportView>`.
- Note: `setReport` is from a custom hook — verify it accepts a full `GeneratedSiteReport`.

**Integration test** (`report-view-editable.test.tsx`):
- Render `<ReportView report={…} editable onReportChange={mock} />`.
- Find a worker role's `EditableField`, simulate edit + commit, assert `mock` was called with a `GeneratedSiteReport` whose `report.workers.roles[0].role` is the new value.
- Same for sections, issues, materials. ~6–8 tests.

**Verify (full Commit 2 gate):**
```bash
cd ~/Workspace/haru3-reports-manual-report-edit
pnpm test:mobile
cd apps/mobile && pnpm exec tsc --noEmit
```
Expected: 0 new tsc errors (6 pre-existing baseline). Test count up by ~30 from baseline.

**Commit (2-final):** `feat(mobile): wire editable cards through ReportView (manual edit mode)`

---

## Commit 3 — `useReportAutoSave`

**Files:**
- Create: `apps/mobile/hooks/useReportAutoSave.ts`
- Create: `apps/mobile/hooks/useReportAutoSave.test.tsx`

**Contract:**

```ts
import type { GeneratedSiteReport } from "@/lib/generated-report";

interface UseReportAutoSaveArgs {
  reportId: string | null;          // null = disabled
  projectId: string;
  report: GeneratedSiteReport | null;
  debounceMs?: number;              // default 1500
}

interface UseReportAutoSaveResult {
  flush: () => Promise<void>;       // immediate write of pending edit
  markSaved: (snapshot: GeneratedSiteReport) => void;  // prime cache (no write)
  isSaving: boolean;
  lastSavedAt: number | null;
}

export function useReportAutoSave(args: UseReportAutoSaveArgs): UseReportAutoSaveResult;
```

**Behaviour:**
- Maintains a ref of the last-persisted snapshot (deep-compared by JSON.stringify, OK for this size).
- When `report` changes and differs from the persisted snapshot, debounce 1500ms then call `useLocalReportMutations().update.mutateAsync({ reportId, projectId, report })`.
- `markSaved(snapshot)`: sets the persisted-snapshot ref to `snapshot` *without* writing. Used to prime the cache when hydrating from DB so the first debounce tick doesn't immediately re-write the just-loaded data.
- `flush()`: cancels debounce, awaits `mutateAsync` if a pending write exists, returns void.
- `AppState.addEventListener("change", state => { if (state !== "active") flush(); })` — flush on background.
- Returns `isSaving` driven by mutation pending state, `lastSavedAt` updated on success.

**Tests** (≥6):
- Debounces: rapid changes → 1 mutation call.
- `markSaved` prevents initial write when value matches.
- `flush` triggers immediate write.
- AppState background → flush called.
- `reportId=null` → no writes ever.
- Cleanup on unmount cancels pending timer.

Use vi fake timers for debounce. Mock `useLocalReportMutations` and `react-native`'s AppState.

**Verify:**
```bash
cd apps/mobile && pnpm exec vitest run hooks/useReportAutoSave.test.tsx
```

**Commit:** `feat(mobile): add useReportAutoSave hook with debounce and flush`

---

## Commit 4 — saved-report screen edit mode + docs

**Files:**
- Modify: `apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`
- Modify: `apps/mobile/__tests__/report-detail-screen-source-notes.test.tsx` (extend mocks per skill)
- Create: `apps/mobile/__tests__/report-detail-screen-edit-mode.test.tsx`
- Create or update: `docs/04-report-schema.md` — note manual edit feature
- Create: `docs/feature-manual-report-edit.md` — short feature doc

**Wiring** (use the canonical pattern from the `haru3-reports` skill — see "Manual edit mode on a saved-report detail screen"):

```ts
const [isEditing, setIsEditing] = useState(false);
const [localReport, setLocalReport] = useState<GeneratedSiteReport | null>(null);
const [hydratedReportId, setHydratedReportId] = useState<string | null>(null);

useEffect(() => {
  if (!report || isEditing) return;
  setLocalReport(report);
  setHydratedReportId(reportId);
}, [report, reportId, isEditing]);

const { flush, markSaved, isSaving } = useReportAutoSave({
  reportId: hydratedReportId,
  projectId,
  report: localReport,
});

useEffect(() => {
  if (!isEditing && localReport && hydratedReportId === reportId) {
    markSaved(localReport);
  }
}, [isEditing, localReport, hydratedReportId, reportId, markSaved]);

const handleToggleEdit = async () => {
  if (isEditing) {
    await flush();
    setIsEditing(false);
    queryClient.invalidateQueries({ queryKey: reportKey(reportId) });
    queryClient.invalidateQueries({ queryKey: reportsKey(projectId) });
  } else {
    if (!localReport && report) setLocalReport(report);
    setIsEditing(true);
  }
};
```

**UI:**
- Add Edit/Done button in the existing header action row. `Pencil` icon when not editing, `Check` when editing. Disabled during `isSaving || isExporting || isDeleting`.
- Disable the "Actions" (export/delete/share) button while `isEditing` — no destructive ops mid-edit.
- Show a tiny "Saving…" / "Saved" indicator near the button driven by `isSaving` and `lastSavedAt`.
- `<ReportView report={localReport ?? report} editable={isEditing} onReportChange={setLocalReport} />`. **Don't double-wrap** (skill explicitly warns).

**Tests:**
- Extend the existing `report-detail-screen-source-notes.test.tsx` mocks: add `update: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }` to the `useLocalReportMutations` mock; add `AppState: { addEventListener: () => ({ remove: () => undefined }) }` to the `react-native` mock; add `Pencil`/`Check` to the `lucide-react-native` mock. (See skill section "Adding `useReportAutoSave` to a screen breaks existing screen tests.")
- New `report-detail-screen-edit-mode.test.tsx`:
  - Tap Edit → cards render in editable mode (find an `EditableField` testID).
  - Edit a value → autosave mutation called after debounce (use vi fake timers).
  - Tap Done → flush awaited, query invalidations dispatched.
  - Actions button disabled while editing.

**Docs:**
- Create `docs/feature-manual-report-edit.md` (short — what / why / how to invoke / how it persists).
- Add a 1-line cross-link in `docs/04-report-schema.md` pointing to the manual-edit feature.

**Verify (final gate):**
```bash
cd ~/Workspace/haru3-reports-manual-report-edit
pnpm test:mobile
cd apps/mobile && pnpm exec tsc --noEmit
```

**Commit:** `feat(mobile): manual edit mode on saved-report detail screen`

---

## Definition of done

- All four commits land on `feat/manual-report-edit`.
- `pnpm test:mobile` green; tsc clean against the 6-error baseline (no new errors).
- User can type-edit every part of the report on both the generate screen (existing flow) and the saved-report detail screen (new flow).
- Saved-report edits autosave debounced and survive app background.
- Skill (`haru3-reports`) gets a patch with anything new we learn during this run (e.g. `EditableField` testing patterns if they're tricky).

## Ground rules for implementer subagents

- **Load `haru3-reports` skill first.** It contains the test patterns, the `GeneratedSiteReport` shape trap, the `report-edit-helpers` contract, and the autosave-test mock checklist.
- **Don't re-introduce the parent-side `editingIndex` state machine.** Per-card local edit state only.
- **Inline the `vi.mock` blocks** in each test file — `vi.mock` does not cross file boundaries (skill explicitly warns).
- **Run the gate before claiming done:** `pnpm test:mobile` from repo root, then `pnpm exec tsc --noEmit` inside `apps/mobile`. Compare tsc count against the 6 pre-existing baseline.
- **Commit only what you wrote.** Avoid `git add -A` blindly — use explicit paths or `rm -rf .hermes/` first (skill rule).
- **Conventional Commits.** Don't push to `main`. The branch is `feat/manual-report-edit`.
