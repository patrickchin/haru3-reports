# Manual report edit

> **Status:** Shipped on `feat/manual-report-edit-card-toggle`.
> **Surfaces:** generate-report screen (post-generation draft) + saved-report detail screen.
> **See also:** [`10-manual-report-edit.md`](./10-manual-report-edit.md) for the
> full architecture (helpers, primitives, autosave, tests, pitfalls).

## What

A manual edit mode lets the user type-edit every part of a generated site
report — meta, weather, workers, materials, issues, next steps, and free-text
sections — directly inside the existing report card UI. The same
`<ReportView>` renders in either read-only or editable mode.

## UX shape (final, card-level toggle)

- **Each card has its own Edit (pencil) button** in its header. Tapping it
  flips the card body into edit mode and the header into a Save (check) +
  Cancel (X) pair.
- **No screen-level edit-mode toggle.** The screen header has no Edit/Done
  button — `editable` is wired straight through `<ReportView>` to every card,
  and each card decides for itself when it's in edit mode.
- **No per-field pencil.** The earlier `EditableField` per-field affordance
  was deleted in favour of one toggle per card.
- **Repeat-row cards** (Workers, Materials, Issues, NextSteps) expose **Add
  row** + per-row trash buttons inline while the card is in edit mode.
- **Save commits the whole card's draft** via one `onChange(commit(draft))`
  call using a `report-edit-helpers` helper. Cancel discards the draft and
  fires no `onChange`.

The same card-toggle pattern is wired up identically on:

1. **`apps/mobile/app/projects/[projectId]/reports/generate.tsx`** — the
   post-generation project-report draft.
2. **`apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`** — the
   saved-report detail screen.

## Why

After an LLM generates a report from raw notes, the user often needs to fix
small mistakes (misheard name, mistyped quantity, swap a "next step" wording).
Round-tripping through "delete and regenerate" was unacceptable. Direct
in-place editing keeps the audit trail (raw notes are still attached) while
giving the user a fast escape hatch.

The card-level toggle (vs. earlier prototypes that used a screen-level toggle
or per-field pencils) won out because:

- **Scoped commit boundary.** The user explicitly opens one card, types,
  and saves it. Cancel is meaningful at the card level — it's hard to
  define "cancel" coherently across a whole-report mode.
- **No mode confusion.** Earlier prototypes had both a screen-level Edit
  toggle and per-field pencils, which made "am I in edit mode?" ambiguous.
- **Visual calm.** The read state has zero affordances; only the card the
  user is interacting with shows controls.

## Persistence (autosave)

Each card's Save commit feeds `useReportAutoSave`
(`apps/mobile/hooks/useReportAutoSave.ts`):

- The screen holds `localReport` separately from the React Query cache.
  Card commits flow up via `<ReportView onReportChange={setLocalReport}>`.
- The hook diffs `localReport` against a snapshot and debounces writes
  (1500ms) via `useLocalReportMutations().update.mutateAsync`, which writes
  `{ fields: { report_data } }` to the local SQLite-backed store and queues
  a sync.
- `AppState` transitions out of `"active"` trigger an immediate `flush()`.
- Autosave is **always on** while the screen is mounted with `editable`
  true — there is no separate enter/exit toggle.

## TestIDs / accessibility labels

| TestID                       | Role                                  |
|------------------------------|---------------------------------------|
| `<card>-edit`                | Card-level Edit (pencil) button       |
| `<card>-save`                | Card-level Save (check) button        |
| `<card>-cancel`              | Card-level Cancel (X) button          |
| `report-edit-status`         | Optional status pill: `Saving…` / `Saved` |
| `btn-report-actions`         | Actions menu (export, share, delete)  |

Accessibility labels on `CardEditButtons`: `Edit` / `Save` / `Cancel`.

## Tests

- Per-card tests under `apps/mobile/components/reports/*.test.tsx` cover the
  edit toggle, draft-commit, cancel-discard, and add/remove-row flows.
- `apps/mobile/components/reports/CardEditButtons.test.tsx` — primitive.
- `apps/mobile/__tests__/report-detail-screen-source-notes.test.tsx` — mocks
  `update.mutateAsync` + `AppState.addEventListener` so the
  `useReportAutoSave` wiring on the screen doesn't crash existing tests.

## Pitfalls

- **Don't reintroduce a screen-level edit toggle** — it was removed in
  commit `23901ea` and the screen now wires `editable` straight through.
- **Don't reintroduce `EditableField`** — the per-field pencil component
  was deleted in favour of per-card toggles.
- **Re-sync `draft` from props only when not editing** — otherwise a refetch
  clobbers the user's in-progress card edit.
- **`useReportAutoSave` mock surface in tests.** Any screen test that mounts
  `[reportId].tsx` or `generate.tsx` must mock
  `useLocalReportMutations().update.mutateAsync` *and*
  `AppState.addEventListener`, otherwise the hook crashes on mount under
  `react-test-renderer`.

## Related

- `docs/10-manual-report-edit.md` — full architecture (helpers, card
  contract, autosave invariants).
- `docs/04-report-schema.md` — canonical `GeneratedSiteReport` shape that
  edit mode mutates.
- `apps/mobile/components/reports/CardEditButtons.tsx` — shared header
  Edit/Save/Cancel primitive.
- `apps/mobile/components/reports/ReportView.tsx` — `editable` +
  `onReportChange` props.
- `apps/mobile/lib/report-edit-helpers.ts` — pure mutation helpers used by
  individual editable cards.
- `apps/mobile/hooks/useReportAutoSave.ts` — debounced autosave + AppState
  flush.
