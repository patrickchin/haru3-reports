# Manual report edit

> **Status:** Shipped on `feat/manual-report-edit-card-toggle`.
> **Surfaces:** generate-report screen (post-generation draft) + saved-report detail screen.

The feature lets a user manually fix anything the LLM-generated report got
wrong (e.g. a misheard name or technical term) without re-recording the voice
note. Every part of the report is editable — but edits are scoped to
**one card at a time**.

## Final UX: per-card edit toggle

There is **no screen-level edit-mode toggle**. There is **no per-field pencil**.
Each card owns its own `isEditing` state, and the card header shows a single
**Edit** (pencil) button that flips into a **Save** (check) + **Cancel** (X)
pair while the card is in edit mode.

```
┌─ WorkersCard ──────────────────────── ✎ ─┐         (read-only)
│ 12 workers · 8h                          │
└──────────────────────────────────────────┘

┌─ WorkersCard ──────────────────── ✓  ✕ ─┐          (editing — same card)
│ Total workers: [ 12 ]                    │
│ Hours: [ 8 ]                             │
│ Roles                                    │
│  • [Carpenter] [3]            🗑          │
│  • [Labourer]  [9]            🗑          │
│  [+ Add role]                             │
└──────────────────────────────────────────┘
```

- **Edit (pencil)** — enters edit mode. Body re-renders with `<TextInput>`s
  bound to a card-local `draft` state seeded from the current props.
- **Save (check)** — commits the whole card's draft via a single
  `onChange(commit(draft))` call, using the matching helper from
  `report-edit-helpers.ts`. Exits edit mode.
- **Cancel (X)** — discards `draft`, exits edit mode. No `onChange` fires.

Repeat-row cards (**WorkersCard / MaterialsCard / IssuesCard / NextStepsCard**)
expose **Add row** + per-row **trash** buttons inline, but only while
`isEditing`. Read mode renders the same data as plain text/list rows with
no affordances.

## Where it appears

The same card-toggle pattern is wired up identically on both surfaces:

1. **Generate screen** — `apps/mobile/app/projects/[projectId]/reports/generate.tsx`.
   The post-generation draft renders `<ReportView editable onReportChange={setReport} />`.
   Each card commits independently into the in-memory draft. Tapping
   **Save report** persists via the regular create-report mutation.
2. **Saved-report detail** — `apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`.
   The screen renders `<ReportView editable onReportChange={setLocalReport} />`
   unconditionally — there is no Edit toggle on the screen header. Card-level
   commits flow into `localReport`, and `useReportAutoSave` debounces them to
   the local SQLite-backed store (see [Autosave](#autosave) below).

The screen-level Edit / Done toggle that existed in earlier prototypes was
**removed** (commit `23901ea`) — it duplicated the card affordance and made
the "which mode am I in?" question ambiguous.

## Building blocks

### `apps/mobile/lib/report-edit-helpers.ts`

Pure immutable helpers for producing a new `GeneratedSiteReport` from a slice
patch. Every helper returns a new top-level wrapper AND a new `report` object
so React shallow-equality fires; other slices remain referentially equal.

```ts
updateMeta(r, patch: Partial<GeneratedReportMeta>)        // shallow merge
updateWeather(r, patch | null)                            // null clears
updateWorkers(r, patch | null)                            // null clears
setRoles(r, GeneratedReportRole[])                        // whole-array
setMaterials(r, GeneratedReportMaterial[])
setIssues(r, GeneratedReportIssue[])
setNextSteps(r, string[])
setSections(r, GeneratedReportSection[])

blankRole()      // { role: "", count: null, notes: null }
blankMaterial()  // all-null material with name=""
blankIssue()     // category="other", severity="medium", status="open"
blankSection()   // title="", content="", sourceNoteIndexes=[]
```

`updateWeather` / `updateWorkers` / `setRoles` will seed an empty slice
shape if the slice is currently `null`. Factories back the **Add row**
buttons; required string fields default to `""` so the card UI must surface
validation before commit.

### `apps/mobile/components/reports/CardEditButtons.tsx`

Shared primitive for the card header. Renders `Pencil` when not editing,
`Check` + `X` when editing. Pure presentation — the parent card owns
`isEditing` and the `draft` state. TestIDs: `${testID}-edit`,
`${testID}-save`, `${testID}-cancel`.

### Card author contract

Every editable card follows this shape:

```tsx
function XCard({ data, editable, onChange }: XCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(data);

  // Re-sync draft from props ONLY when not actively editing — otherwise
  // a parent refetch (sync pull, autosave round-trip) would clobber edits.
  useEffect(() => { if (!isEditing) setDraft(data); }, [data, isEditing]);

  const onSave = () => { onChange?.(commit(draft)); setIsEditing(false); };
  const onCancel = () => { setDraft(data); setIsEditing(false); };

  return (
    <Card>
      <CardHeader>
        <Title>…</Title>
        {editable ? (
          <CardEditButtons
            isEditing={isEditing}
            onEdit={() => setIsEditing(true)}
            onSave={onSave}
            onCancel={onCancel}
            testID="x-card"
          />
        ) : null}
      </CardHeader>
      {/* body: <TextInput …draft… /> when isEditing, plain <Text> otherwise */}
    </Card>
  );
}
```

The card never spreads or mutates the report wrapper itself. The parent
(`ReportView`) composes the card's `onChange` payload through one of the
helpers above into a single `setReport(prev => updateX(prev, patch))` call.

The 7 cards adopted this contract:

| Card | onChange signature | Helper used |
|---|---|---|
| `MetaEditCard` | `(patch: Partial<GeneratedReportMeta>) => void` | `updateMeta` |
| `WeatherStrip` | `(patch: Partial<GeneratedReportWeather> \| null) => void` | `updateWeather` |
| `WorkersCard` | `(patch: Partial<GeneratedReportWorkers> \| null) => void` | `updateWorkers` |
| `MaterialsCard` | `(next: GeneratedReportMaterial[]) => void` | `setMaterials` |
| `IssuesCard` | `(next: GeneratedReportIssue[]) => void` | `setIssues` |
| `NextStepsCard` | `(next: string[]) => void` | `setNextSteps` |
| `SummarySectionCard` | `(next: GeneratedReportSection) => void` + `onRemove?` | `setSections` |

### `ReportView`

The single seam between "I have a report" and "I want to edit it":

```tsx
<ReportView report={report} editable onReportChange={setReport} />
```

When `editable && onReportChange`, `ReportView` passes `editable` and a
slice-aware `onChange` to every card, composed through `report-edit-helpers`.
A `MetaEditCard` is rendered above the section list **only in editable mode**.

## Deleted: `EditableField`

The earlier per-field pencil primitive (`EditableField`) was **deleted** in
the card-toggle direction. Field-level edit affordances proliferated visual
noise (a pencil on every cell) and made multi-field cards (Workers,
Materials) feel disjointed — the user would commit one field, the card
would re-render, and the next field's pencil might land in a different
spot. Card-level toggle gives the user one explicit "I'm editing this
section" gesture and one explicit commit.

If you find references to `EditableField` in old plans or commit messages,
they describe the superseded direction.

## Autosave

Powered by `useReportAutoSave` (`apps/mobile/hooks/useReportAutoSave.ts`).
Wired identically on both surfaces (`generate.tsx` for the project-report
draft and `[reportId].tsx` for the saved report).

- The screen holds `localReport` separate from the React Query cache.
  `<ReportView editable onReportChange={setLocalReport} />` mutates only
  the local copy.
- The hook diffs the latest `localReport` against a `persistedJsonRef`
  snapshot (cheap `JSON.stringify` deep-compare). Identical snapshots are
  dropped — no write.
- A 1500ms debounce coalesces rapid keystrokes into one write via
  `useLocalReportMutations().update.mutateAsync`, which writes
  `{ fields: { report_data } }` to the local SQLite-backed store and
  queues a sync.
- `AppState` transitions out of `"active"` trigger an immediate `flush()`,
  so backgrounding the app cannot lose trailing edits.
- Each card's **Save** commit feeds the autosave loop via the normal
  `onReportChange` path — there is no separate "screen Done" event.

Invariants:

- Autosave is **always on** while editing on the saved-report detail screen
  (no toggle to enter/leave).
- A refetch (sync pull, conflict resolution) re-mirrors `localReport` from
  the DB only when **no card is currently in edit mode**. This is enforced
  per-card via the `if (!isEditing) setDraft(data)` effect, so a refetch
  cannot clobber an in-progress card edit.

## TestIDs / accessibility labels

| TestID                       | Role                                  |
|------------------------------|---------------------------------------|
| `<card>-edit`                | Card-level Edit (pencil) button       |
| `<card>-save`                | Card-level Save (check) button        |
| `<card>-cancel`              | Card-level Cancel (X) button          |
| `report-edit-status`         | Optional status pill: `Saving…` / `Saved` |
| `btn-report-actions`         | Existing actions menu (export/share/delete) |

Accessibility labels on `CardEditButtons`: `Edit` / `Save` / `Cancel`.

## Tests

- `apps/mobile/components/reports/CardEditButtons.test.tsx` — primitive
  toggle behaviour.
- `apps/mobile/components/reports/{Workers,Materials,Issues,NextSteps,SummarySection,WeatherStrip,MetaEdit}Card.test.tsx`
  — per-card edit-toggle, draft-commit, and add/remove-row behaviour.
- `apps/mobile/__tests__/report-detail-screen-source-notes.test.tsx` — extended
  to mock `update.mutateAsync` and `AppState.addEventListener` so existing
  source-notes tests still pass after `useReportAutoSave` was added.

## Pitfalls

- **Don't reintroduce a screen-level edit toggle.** The card affordance is
  the canonical entry point. A screen toggle was tried and reverted because
  it created an ambiguous two-mode UX (am I in screen-edit mode? card-edit
  mode? both?).
- **Don't reintroduce `EditableField`.** Per-field pencils were tried and
  reverted in favour of per-card toggles.
- **Re-sync `draft` from props only when not editing.** Otherwise a refetch
  clobbers the user's in-progress card edit.
- **`useReportAutoSave` mock surface in tests.** Any screen test that mounts
  `[reportId].tsx` or `generate.tsx` must mock
  `useLocalReportMutations().update.mutateAsync` *and*
  `AppState.addEventListener`, otherwise the hook crashes on mount under
  `react-test-renderer`.
- **Don't auto-flush on unmount.** The hook deliberately only cancels the
  timer; unmount-flush races with React 19 strict-mode double-mount. The
  card-level Save commit is the only flush trigger besides the debounce
  and AppState backgrounding.

## Related

- `docs/04-report-schema.md` — canonical `GeneratedSiteReport` shape that
  edit mode mutates.
- `apps/mobile/hooks/useReportAutoSave.ts` — autosave hook.
- `apps/mobile/components/reports/ReportView.tsx` — `editable` +
  `onReportChange` props.
- `apps/mobile/components/reports/CardEditButtons.tsx` — shared
  Edit/Save/Cancel header primitive.
- `apps/mobile/lib/report-edit-helpers.ts` — pure mutation helpers used by
  individual editable cards.
