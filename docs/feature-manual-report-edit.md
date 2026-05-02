# Manual report edit

> **Status:** Shipped on `feat/manual-report-edit`.
> **Surfaces:** generate-report screen (post-generation) + saved-report detail screen.

## What

A manual edit mode lets a user type-edit every part of a generated site report — meta, issues, workers, materials, next steps, and free-text sections — directly inside the existing report card UI. There is no separate edit form; the same `<ReportView>` renders in either read-only or editable mode.

## Why

After an LLM generates a report from raw notes, the user often needs to fix small mistakes (wrong worker name, mistyped quantity, swap a "next step" wording). Round-tripping through "delete and regenerate" was unacceptable. Direct in-place editing keeps the audit trail (raw notes are still attached) while giving the user a fast escape hatch.

## How to invoke

### Generate screen
Edit mode is implicit: as soon as a report is generated, every card is editable. Changes mutate the in-memory `report` until the user taps **Save report**, which persists via the regular create-report mutation.

### Saved-report detail screen
1. Open a saved report (`/projects/[projectId]/reports/[reportId]`).
2. Tap the **Edit** button (pencil icon) in the header action row, next to **Actions**.
3. Cards become editable. A small status pill (`Editing` → `Saving…` → `Saved`) appears beside the toggle.
4. Type. Edits autosave after a 1.5s debounce — and immediately if the app backgrounds.
5. Tap **Done** (check icon) to exit. Pending edits are flushed synchronously before the toggle resolves.

While editing, the **Actions** button (export, share, delete) is disabled to prevent destructive ops mid-edit.

## How it persists

Powered by `useReportAutoSave` (`apps/mobile/hooks/useReportAutoSave.ts`):

- The screen holds `localReport` separate from the React Query cache. `<ReportView editable onReportChange={setLocalReport} />` mutates only the local copy.
- The hook diffs the latest `localReport` against a `persistedJsonRef` snapshot (cheap `JSON.stringify` deep-compare). Identical snapshots are dropped — no write.
- A 1500ms debounce coalesces rapid keystrokes into one write via `useLocalReportMutations().update.mutateAsync`, which writes `{ fields: { report_data } }` to the local SQLite-backed store and queues a sync.
- `AppState` transitions out of `"active"` trigger an immediate `flush()`, so backgrounding the app cannot lose trailing edits.
- On **Done**, the screen `await flush()`s, exits edit mode, then invalidates `reportKey(reportId)` and `reportsKey(projectId)` so cached views re-fetch the freshly persisted snapshot.

## State machine (saved-report screen)

```
                  ┌────── tap Edit ──────┐
                  ▼                       │
   read-only ──> editing ──> autosaving ──┤
       ▲             │           │        │
       └─tap Done────┴───flush───┴────────┘
```

- `isEditing`: user-facing toggle. Drives `<ReportView>.editable`.
- `isAutoSaving`: mirrors `useLocalReportMutations().update.isPending`. Drives the `Saving…` pill and disables the Edit toggle while a write is in flight.
- `lastSavedAt`: most recent successful write. Drives the `Saved` pill once the first write lands.
- `hydratedReportId`: which report id the local copy was hydrated from. Prevents cross-report autosave bleeds when the user navigates between reports rapidly.

## TestIDs / accessibility labels

| TestID                       | Role                                 |
|------------------------------|--------------------------------------|
| `btn-report-edit-toggle`     | Edit / Done toggle                   |
| `report-edit-status`         | Status pill: `Editing` / `Saving…` / `Saved` |
| `btn-report-actions`         | Existing actions menu (disabled while editing) |

Accessibility labels: `Edit report` / `Finish editing report`.

## Tests

- `apps/mobile/__tests__/report-detail-screen-edit-mode.test.tsx`
  - Toggle enters edit mode → `<ReportView editable=true>`.
  - `onReportChange` mutates local state; **Done** flushes via `update.mutateAsync` with the edited payload and invalidates both query keys.
  - Edit toggle is disabled while autosave is in flight.
  - Actions button is disabled while editing.
- `apps/mobile/__tests__/report-detail-screen-source-notes.test.tsx` — extended to mock `update.mutateAsync` and `AppState.addEventListener` so existing source-notes tests still pass after `useReportAutoSave` was added.

## Pitfalls

- **Don't double-wrap `<ReportView>` in another editable shell.** It already owns its own card-level edit state; wrapping it in a parent edit-state machine causes stale-closure bugs.
- **`useReportAutoSave` mock surface in tests.** Any screen test that mounts `[reportId].tsx` must mock `useLocalReportMutations().update.mutateAsync` *and* `AppState.addEventListener`, otherwise the hook crashes on mount under `react-test-renderer`.
- **Don't auto-flush on unmount.** The hook deliberately only cancels the timer; unmount-flush races with React 19 strict-mode double-mount. The screen calls `flush()` explicitly via the Done toggle.

## Related

- `docs/04-report-schema.md` — canonical `GeneratedSiteReport` shape that edit mode mutates.
- `apps/mobile/hooks/useReportAutoSave.ts` — autosave hook.
- `apps/mobile/components/reports/ReportView.tsx` — `editable` + `onReportChange` props.
- `apps/mobile/lib/report-edit-helpers.ts` — pure mutation helpers used by individual editable cards.
