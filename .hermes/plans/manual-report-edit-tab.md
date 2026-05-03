# Plan: Manual Report Edit — separate Edit tab (replacement)

**Branch:** `feat/manual-report-edit-tab` (off `feat/manual-report-edit`)

## Goal

Replace per-card inline edit affordances with a dedicated **Edit tab** that
renders the full report as one always-editable form. All fields editable, no
toggle. Autosave via existing `useReportAutoSave` hook.

## Architecture decisions

1. **Cards revert to pure read-only display.** Remove `editable` / `onChange`
   props from all 7 cards (Workers, Materials, Issues, NextSteps,
   SummarySection, WeatherStrip) plus `MetaEditCard` (delete entirely — it
   only existed to host edit-mode meta fields).
2. **ReportView reverts to read-only.** Drop `editable`, `onReportChange`
   props. ReportView becomes a thin display wrapper again.
3. **`EditableField` is deleted.** The new Edit tab uses always-editable
   `TextInput`s — no display↔edit toggle needed.
4. **Keep `lib/report-edit-helpers.ts`** — pure immutable update functions,
   exactly what the new form needs.
5. **Keep `hooks/useReportAutoSave.ts`** — debounced autosave, drives the new
   tab.
6. **New component: `ReportEditForm`** — single flat form, sections grouped
   by report area (Meta → Weather → Workers → Materials → Issues → Next Steps
   → Summary Sections). Uses `report-edit-helpers` to compose patches.
7. **`generate.tsx` tabs:** `["notes", "report", "edit", "debug"]`. Edit tab
   only enabled when a report exists.
8. **Saved-report screen:** replace existing `editingMode` toggle with the
   same tab pattern: `["report", "edit"]`. No debug tab on this screen.

## Anti-patterns to avoid

- Don't double-wrap `GeneratedSiteReport` (cost us hours last attempt — the
  payload IS the wrapper, don't nest it again).
- Don't reintroduce `EditableField`'s display↔edit toggle in the new form.
- Don't put autosave logic inside `ReportEditForm` — keep it in the screen
  so the form stays pure-controlled.

## Commits & dispatch

| # | Title | Files | Subagent budget | Mode |
|---|---|---|---|---|
| 1 | Strip editable from cards + ReportView; delete EditableField + MetaEditCard | ~10 | 120 calls | sequential |
| 2 | Add `ReportEditForm` component + tests | ~3 | 80 calls | sequential |
| 3 | Wire `edit` tab into `generate.tsx` | ~2 | 80 calls | parallel with #4 |
| 4 | Wire `edit` tab into saved-report screen (replace toggle) | ~2 | 80 calls | parallel with #3 |

All under the 300 cap with headroom.

## Commit 1 — Revert card editability

**Delete:**
- `components/reports/EditableField.tsx`
- `components/reports/EditableField.test.tsx`
- `components/reports/MetaEditCard.tsx`
- `__tests__/report-view-editable.test.tsx`

**Modify (strip `editable`/`onChange` props, restore plain Text rendering):**
- `components/reports/WorkersCard.tsx`
- `components/reports/MaterialsCard.tsx`
- `components/reports/IssuesCard.tsx`
- `components/reports/NextStepsCard.tsx`
- `components/reports/SummarySectionCard.tsx` (and `.test.tsx` — drop
  editable assertions, keep display-mode assertions)
- `components/reports/WeatherStrip.tsx`
- `components/reports/ReportView.tsx` (drop `editable`, `onReportChange`,
  MetaEditCard import; pass plain `report` to all cards)

**Keep untouched:**
- `lib/report-edit-helpers.ts` (and tests)
- `hooks/useReportAutoSave.ts` (and tests)

**Also strip** any `editable`/`onReportChange` usage in `generate.tsx` and
`[reportId].tsx` left over from the prior branch — but DO NOT yet add the
edit tab. Those screens render plain ReportView in this commit.

**Gate:** `pnpm test:mobile` green, `pnpm tsc` clean.

## Commit 2 — `ReportEditForm` component

**New:** `components/reports/ReportEditForm.tsx`

**API:**
```tsx
interface ReportEditFormProps {
  report: GeneratedSiteReport;
  onChange: (next: GeneratedSiteReport) => void;
}
```

**Structure (top to bottom):**
1. Project meta block — title, date, summary (multiline)
2. Weather block — condition, temperature, wind, precipitation, notes
3. Workers — repeating rows with role/count/notes; add/remove buttons
4. Materials — repeating rows; add/remove
5. Issues — repeating rows (title, details, actionRequired); add/remove
6. Next Steps — repeating rows; add/remove
7. Summary Sections — repeating rows (heading, body multiline); add/remove

**Implementation:**
- Each input is a plain `TextInput`, always-editable, controlled by `report`.
- `onChangeText` calls the appropriate helper (`updateMeta`, `setWorkers`,
  etc.) and bubbles the result through `onChange`.
- For repeating sections: re-use existing `blankRole()`, `blankMaterial()`,
  `blankIssue()`, `blankNextStep()`, `blankSection()` helpers.
- Use `AppDialogSheet` (NOT `Alert.alert`) for any "Remove this row?" confirm.
- Style: existing `Card` + `SectionHeader` primitives, `colors` tokens.

**New test:** `components/reports/ReportEditForm.test.tsx`
- Renders all sections from a fixture report
- Typing in a meta field updates via onChange with the right helper
- Adding/removing a worker row updates the array
- Sections are independent (editing one doesn't lose others)

**Gate:** `pnpm test:mobile` green, `pnpm tsc` clean.

## Commit 3 — `edit` tab in `generate.tsx`

- `TAB_ORDER = ["notes", "report", "edit", "debug"] as const;`
- New label helper case for `"edit"` in `getGenerateReportTabLabel`
- New tab button (mirror existing tab button styling), disabled when no
  report
- Pager renders `<ReportEditForm report={...} onChange={setReport} />` for
  the edit tab
- Wire `useReportAutoSave({ report, reportId })` at the screen level so it
  fires from any tab where `report` mutates

**Test:** add minimal smoke test in existing tab-flow tests that the edit
tab renders the form when a report is present.

## Commit 4 — `edit` tab on saved-report screen (`[reportId].tsx`)

- Remove existing `editingMode` toggle, header `Edit/Done` button, and
  inline `localReport` rebuild logic
- Add `["report", "edit"]` tab structure mirroring `generate.tsx`
- Edit tab renders `<ReportEditForm>` wired to `useReportAutoSave` (already
  uses it — keep the existing hook call)
- Update `__tests__/report-detail-screen-edit-mode.test.tsx` → rewrite as
  `report-detail-screen-edit-tab.test.tsx`: assert tab switching, form
  visible on edit tab, autosave called on field change

**Gate (final):** `pnpm test:mobile` green, `pnpm tsc` clean, no new
warnings.

## Post-merge follow-ups (out of scope for this branch)

- Field validation hints on the Edit tab (e.g. date format)
- "Discard local edits" button if cloud version diverges
