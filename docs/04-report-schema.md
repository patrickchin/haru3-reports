# Report Schema

The AI-generated report follows the `GeneratedSiteReport` structure. The schema is defined as **Zod schemas** in:

- **Shared package** (canonical): `packages/report-core/src/generated-report.ts`
- **Edge function** (mirror): `supabase/functions/generate-report/report-schema.ts` (uses `npm:zod` in Deno)

Both define the exact same shape. The Zod schemas validate and normalize LLM output (coercing strings to numbers, trimming whitespace, applying defaults). Mobile and playground re-export types from `@harpa/report-core`.

## Top-Level Structure (Simplified)

```
GeneratedSiteReport
└── report
    ├── meta            # Title, type, summary, visit date
    ├── weather?        # Conditions, temperature, wind, site impact (nullable)
    ├── workers?        # Worker counts, hours, roles (nullable)
    ├── materials       # Top-level materials list (concrete, steel, pipes, etc.)
    ├── issues          # Issues / risks requiring action
    ├── nextSteps       # Action items as plain strings
    └── sections        # Freeform markdown sections for narrative detail
```

**Removed in v2** (2026-04-26 refactor):
- ❌ `activities` — content moved to `sections`
- ❌ `siteConditions` — folded into `sections` or dropped
- ❌ `equipment` — removed entirely
- ❌ Cost fields from `materials` and `workers` (unitCost, totalCost, workersCostPerDay, etc.)

## Field Reference

### meta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Report title, e.g. "Site Visit — Wet Weather" |
| reportType | string | yes | One of: `daily`, `safety`, `incident`, `inspection`, `site_visit`, `progress` |
| summary | string | yes | Brief overview of the report |
| visitDate | string \| null | no | ISO date (`YYYY-MM-DD`) of the site visit |

### weather (nullable)

| Field | Type | Description |
|-------|------|-------------|
| conditions | string \| null | e.g. "Sunny", "Overcast with light rain" |
| temperature | string \| null | e.g. "24°C", "28-32°C" |
| wind | string \| null | e.g. "Light breeze", "Strong gusts" |
| impact | string \| null | Effect on work, e.g. "No impact", "Concrete pouring delayed" |

### workers (nullable)

| Field | Type | Description |
|-------|------|-------------|
| totalWorkers | number \| null | Total headcount on site |
| workerHours | string \| null | e.g. "192 hrs" |
| notes | string \| null | General crew notes |
| roles | Role[] | Breakdown by trade/role |

**Role:**

| Field | Type | Description |
|-------|------|-------------|
| role | string | e.g. "Carpenter", "Electrician" |
| count | number \| null | Number of workers in this role |
| notes | string \| null | Role-specific notes |

### materials (top-level array)

All materials mentioned across the site, in a single flat list:

| Field | Type | Description |
|-------|------|-------------|
| name | string | e.g. "N12 reinforcement bar", "40 MPa concrete", "Excavator" |
| quantity | string \| null | e.g. "2 tonnes", "15 m³", "1 unit" |
| quantityUnit | string \| null | Unit of measure (optional if included in `quantity`) |
| condition | string \| null | e.g. "Good", "Damaged" |
| status | string \| null | e.g. "Delivered", "On order", "In use" |
| notes | string \| null | Additional notes |

### issues (array)

| Field | Type | Description |
|-------|------|-------------|
| title | string | Issue title, e.g. "Delivery Delay" |
| category | string | e.g. "schedule", "safety", "quality" (defaults to "other") |
| severity | string | e.g. "low", "medium", "high" (defaults to "medium") |
| status | string | e.g. "open", "in_progress", "resolved" (defaults to "open") |
| details | string | Full description |
| actionRequired | string \| null | What needs to be done |
| sourceNoteIndexes | number[] | Which voice notes this was extracted from |

### nextSteps (string array)

Plain action items, e.g.:
- "Order rebar for next pour"
- "Schedule crane inspection"

### sections (array)

Freeform narrative sections:

| Field | Type | Description |
|-------|------|-------------|
| title | string | Section heading, e.g. "Foundation Work" |
| content | string | Markdown content (can include lists, headings, paragraphs) |
| sourceNoteIndexes | number[] | Which voice notes this was extracted from |

## Usage

### Validation

Use `normalizeGeneratedReportPayload(value)` for safe parsing (returns `null` on error):

```typescript
import { normalizeGeneratedReportPayload } from "@harpa/report-core";

const report = normalizeGeneratedReportPayload(llmOutput);
if (!report) {
  // Invalid shape
}
```

### Throwing Parse

In edge functions, use `parseGeneratedSiteReport(value)` to throw `TypeError` on invalid input:

```typescript
import { parseGeneratedSiteReport } from "./report-schema.ts";

const report = parseGeneratedSiteReport(llmOutput); // throws TypeError if invalid
```

## Storage

The report is stored in the `reports` table as JSONB in the `report_data` column. The Zod schemas ensure all stored reports conform to this shape. The edge function enforces this schema on every LLM response before saving.

## Source-files contract — `report_notes.file_id`

The generated report's `report_data` is the AI output, but the **source notes that fed it** (raw text, voice-note transcripts, photos, documents) live in the `report_notes` table. Files (photos, documents, voice notes) live in `file_metadata` and storage; they are linked into a report through `report_notes.file_id`.

> **Invariant (enforced by tests in `supabase/tests/invariant_report_notes_file_link.test.ts`):**
>
> Every `file_metadata` row that participates in a report MUST have a corresponding `report_notes` row with `file_id = file_metadata.id`. Equivalently:
>
> ```sql
> SELECT count(*) FROM file_metadata fm
> WHERE fm.deleted_at IS NULL
>   AND fm.report_id IS NOT NULL
>   AND fm.category IN ('voice-note','image','document','attachment')
>   AND NOT EXISTS (
>     SELECT 1 FROM report_notes rn
>     WHERE rn.file_id = fm.id AND rn.deleted_at IS NULL
>   );
> -- must return 0
> ```

### Producers (only ways a `report_notes` row should be created for a file)

| Source | File category | `report_notes.kind` | Code path |
|--------|---------------|---------------------|-----------|
| Image picker / camera capture | `image` | `image` | `useFileUpload({ reportId, category: "image", ... })` writes the linking row in the same mutation; rolls back the storage object if the note insert fails. |
| Document picker | `document` / `attachment` | `document` | Same `useFileUpload` path. |
| Voice recorder (online) | `voice-note` | `voice` | `app/projects/[projectId]/reports/generate.tsx` `handleVoiceNoteSaved` always calls `createNote`, even when the transcript is empty (`body = null`). |
| Voice recorder (offline) | `voice-note` | `voice` | `lib/sync/voice-note-machine.ts` `processOne` creates the row whenever `row.report_id` is set; an empty transcription is stored as `body = null` so the user can retry transcription later via `updateNote`. |

`category = 'icon'` files (project logos / avatars) are project assets only and never get a `report_notes` row.

### Consumers (only ways files should render in a report)

| UI location | Component | Source of truth |
|-------------|-----------|-----------------|
| Completed-report screen, source-notes section | `components/files/ReportLinkedFiles.tsx` | Filters `useProjectFiles(projectId)` down to the set of `file_id`s present in `noteRows` — the report's own `report_notes` rows. |
| Draft-report timeline | `hooks/useNoteTimeline.ts` | Same rule: a file appears only if its id is in `linkedFileIds` (derived from `noteRows.file_id`) and not in `excludedFileIds` (claimed by sibling reports). The legacy time-window fallback was removed in this fix. |

> Listing files by `project_id` alone (the pre-fix behaviour of `[reportId].tsx` rendering `<VoiceNoteList projectId>` + `<FileList projectId>`) leaks every project file into every report. Do not reintroduce that pattern.

### Backfill

`supabase/migrations/202605010007_backfill_orphan_report_notes.sql` repairs existing prod orphans by inserting one `report_notes` row per orphaned `file_metadata` row, deriving `kind` from `category` and copying `transcription` into `body` for voice notes.

## Breaking Changes Log

### 2026-04-26: Schema Simplification (v2)

- **Removed**:
  - `activities` → content moved to `sections` (freeform markdown)
  - `equipment` → removed entirely
  - `siteConditions` → folded into `sections` or dropped
  - All cost fields: `unitCost`, `totalCost`, `workersCostPerDay`, etc.
- **Renamed**:
  - `manpower` → `workers`
- **Promoted**:
  - `materials` is now top-level (not nested in activities)
- **Migration**: `202604260002_simplify_report_schema.sql` truncates the `reports` table (pre-launch breaking change, no users affected)
