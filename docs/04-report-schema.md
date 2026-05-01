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
