# Manual report edit

> Status: Commits 1 & 2 landed. Cards are editable; ReportView wires the whole
> draft-edit experience. The saved-report screen wire-up is still upcoming
> (Commit 4) along with autosave (Commit 3).

The feature lets a user manually fix anything the LLM-generated report got
wrong (e.g. a misheard name or technical term) without re-recording the voice
note. Every part of the report is editable inline.

This doc covers the architecture and the building blocks every editable card
needs:

1. **`apps/mobile/lib/report-edit-helpers.ts`** — pure immutable helpers for
   producing a new `GeneratedSiteReport` from a slice patch.
2. **`apps/mobile/components/reports/EditableField.tsx`** — display ↔ TextInput
   primitive that every card uses for individual fields.
3. **`apps/mobile/components/reports/ReportView.tsx`** — drives the whole
   experience via two props: `editable` and `onReportChange`.

The architecture is intentional: cards never mutate. They take an `editable`
boolean and an `onChange` callback, and the parent (e.g. `ReportView`) feeds
the result through one of these helpers. Per-card local edit state only — no
parent-side `editingIndex` state machine.

---

## `report-edit-helpers.ts`

Every helper returns a NEW top-level wrapper AND a new `report` object so React
shallow-equality fires. Other slices remain referentially equal.

### Slice patches

```ts
updateMeta(r, patch: Partial<GeneratedReportMeta>)        // shallow merge
updateWeather(r, patch | null)                            // null clears
updateWorkers(r, patch | null)                            // null clears
```

`null` clears the slice. A partial patch applied to a currently-`null` slice
seeds an empty shape (`{ conditions: null, temperature: null, … }` for weather;
`{ totalWorkers: null, workerHours: null, notes: null, roles: [] }` for
workers) and overlays the patch on top. This is the path "user starts typing
into an empty section" goes through.

`GeneratedReportMeta` is exported from this module as
`GeneratedSiteReport["report"]["meta"]` since `@harpa/report-core` does not
expose the meta type as a top-level name.

### Whole-array setters

```ts
setRoles(r, GeneratedReportRole[])
setMaterials(r, GeneratedReportMaterial[])
setIssues(r, GeneratedReportIssue[])
setNextSteps(r, string[])
setSections(r, GeneratedReportSection[])
```

`setRoles` will seed an empty workers slice if it is currently `null`.

### Factories for "Add row" buttons

```ts
blankRole()      // { role: "", count: null, notes: null }
blankMaterial()  // all-null material with name=""
blankIssue()     // category="other", severity="medium", status="open"
blankSection()   // title="", content="", sourceNoteIndexes=[]
```

Required string fields default to `""` so the card UI must surface validation
before the user commits. Each call returns a fresh object — no shared refs.

---

## `EditableField`

```ts
interface EditableFieldProps {
  value: string;
  onChange: (next: string) => void;     // committed on Check / blur
  editable?: boolean;                   // default false → renders plain Text
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;                    // keyboardType="number-pad" (value is still a string)
  textClassName?: string;               // tailwind for both display Text and TextInput
  emptyDisplay?: string;                // shown when value=="" and not editing (e.g. "—")
  testID?: string;                      // <testID> on outer Pressable; "<testID>-input" on TextInput; "<testID>-save" on save button
  accessibilityLabel?: string;
}
```

### Behaviour

- `editable=false` → plain `<Text>` with `value || emptyDisplay`.
- `editable=true` and not in edit mode → `<Pressable>` showing the value and a
  small pencil icon. Both tap and long-press enter edit mode.
- In edit mode → `<TextInput>` with autofocus, controlled local draft, plus a
  Check button. **Check, blur, and (single-line) submit all commit** by calling
  `onChange(draft)` and exiting edit mode.
- There is no Cancel path. Single commit path keeps the model simple — re-edit
  to fix a typo.
- Numeric mode commits the raw string the user typed; the parent decides how
  to parse it.

### Test pattern

`EditableField` forwards `testID` to its host node, but
`renderer.root.findByProps({ testID })` will also match the React component
instance (which has the prop on its props object too), and `onPress` only
exists on the host. Filter with:

```ts
function findHost(renderer, testID) {
  return renderer.root
    .findAllByProps({ testID })
    .find((m) => typeof m.type === "string");
}
```

See `apps/mobile/components/reports/EditableField.test.tsx` for the canonical
shape (vitest + react-test-renderer + module-scope `onChangeMock = vi.fn()`).

---

## Card author contract

When a card needs to be editable, it follows this props pattern:

```ts
interface XCardProps {
  // existing readonly props
  editable?: boolean;
  onChange?: (next) => void;   // slice patch shape OR whole-array shape, matching the matching helper
}
```

The card calls `onChange` with the new slice or array. The parent composes
through helpers (`updateWorkers`, `setMaterials`, …). The card never spreads or
mutates the report wrapper itself.

In Commit 2, all 7 cards adopted this contract:

| Card | onChange signature | Helper used |
|---|---|---|
| `MetaEditCard` (new) | `(patch: Partial<GeneratedReportMeta>) => void` | `updateMeta` |
| `WeatherStrip` | `(patch: Partial<GeneratedReportWeather> \| null) => void` | `updateWeather` |
| `WorkersCard` | `(patch: Partial<GeneratedReportWorkers> \| null) => void` | `updateWorkers` |
| `MaterialsCard` | `(next: GeneratedReportMaterial[]) => void` | `setMaterials` |
| `IssuesCard` | `(next: GeneratedReportIssue[]) => void` | `setIssues` |
| `NextStepsCard` | `(next: string[]) => void` | `setNextSteps` |
| `SummarySectionCard` | `(next: GeneratedReportSection) => void` + `onRemove?` | `setSections` |

`MetaEditCard` is the one new component — the existing read-only Summary block
in `ReportView` continues to render meta when `editable=false`.

`SummarySectionCard` had a breaking prop change in Commit 2: the previous
parent-coordinated edit-state machine (`editingIndex`, `editingContent`,
`onEditStart/Change/Save`) was deleted. Each card now owns its own edit state
via `EditableField`'s internal display↔input flip. **No central edit-mode
coordinator anywhere in the tree.**

## ReportView edit wiring

`ReportView` is the single seam between "I have a report" and "I want to edit
it":

```tsx
<ReportView
  report={report}
  editable
  onReportChange={setReport}
/>
```

When `editable && onReportChange`, ReportView passes `editable` and a
slice-aware `onChange` to every card, composed through `report-edit-helpers`.
A `MetaEditCard` is rendered above the section list **only in editable mode**.

Screen consumers (`generate.tsx`, and later `[reportId].tsx`) just hand
ReportView their draft setter — they don't have to know which helper goes
with which card.

The IssuesCard maps the user-facing labels in the plan to the actual
`GeneratedReportIssue` schema as follows: "description" → `details` (the
multi-line body), "notes" → `actionRequired` (the call-out free-text). Schema
fields not exposed in the editor (`status`, `sourceNoteIndexes`) are
preserved unchanged on edits and seeded sensibly by `blankIssue()`.
