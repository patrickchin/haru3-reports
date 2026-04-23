# Report Schema

The AI-generated report follows the `GeneratedSiteReport` structure. The schema is defined in two places:

- **Edge function** (TypeScript types): `supabase/functions/generate-report/report-schema.ts`
- **Shared package** (Zod schemas): `packages/report-core/src/generated-report.ts`, re-exported from `apps/mobile/lib/generated-report.ts` and `apps/playground/src/lib/generated-report.ts` as thin facades.

The edge function types are the canonical definition. The Zod schemas in `@harpa/report-core` validate and normalise LLM output (coercing strings to numbers, trimming whitespace, applying defaults).

## Top-Level Structure

```
GeneratedSiteReport
└── report
    ├── meta            # Title, type, summary, visit date
    ├── weather?        # Conditions, temperature, wind, site impact (nullable)
    ├── manpower?       # Worker counts, hours, costs, roles (nullable)
    ├── siteConditions  # General site observations
    ├── activities      # The main backbone — work items with nested detail
    ├── issues          # Top-level issues (not tied to a specific activity)
    ├── nextSteps       # Action items as plain strings
    └── sections        # Freeform markdown sections
```

## Field Reference

### meta

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Report title, e.g. "Block A — Foundation Works" |
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

### manpower (nullable)

| Field | Type | Description |
|-------|------|-------------|
| totalWorkers | number \| null | Total headcount on site |
| workerHours | string \| null | e.g. "192 hrs" |
| workersCostPerDay | string \| null | e.g. "$8,400" |
| workersCostCurrency | string \| null | Currency code |
| notes | string \| null | General manpower notes |
| roles | Role[] | Breakdown by trade/role |

**Role:**

| Field | Type | Description |
|-------|------|-------------|
| role | string | e.g. "Carpenter", "Electrician" |
| count | number \| null | Number of workers in this role |
| notes | string \| null | Role-specific notes |

### activities (array)

Activities are the main structured backbone of the report. Each activity represents a work item.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Activity name, e.g. "Foundation Excavation" |
| description | string \| null | Detailed description |
| location | string \| null | Where on site |
| status | string | `in_progress`, `completed`, `blocked`, `reported`, etc. |
| summary | string | Concise summary of progress |
| contractors | string \| null | Contractor names |
| engineers | string \| null | Engineer names |
| visitors | string \| null | Visitor names |
| startDate | string \| null | ISO date |
| endDate | string \| null | ISO date |
| sourceNoteIndexes | number[] | Which voice notes this was extracted from |
| manpower | Manpower \| null | Activity-specific manpower (same shape as top-level) |
| materials | Material[] | Materials used in this activity |
| equipment | Equipment[] | Equipment used in this activity |
| issues | Issue[] | Issues specific to this activity |
| observations | string[] | Miscellaneous observations |

### materials (nested in activities)

| Field | Type | Description |
|-------|------|-------------|
| name | string | e.g. "N12 reinforcement bar", "40 MPA concrete" |
| quantity | string \| null | e.g. "2 tonnes", "15 m³" |
| quantityUnit | string \| null | Unit of measure |
| unitCost | string \| null | Cost per unit |
| unitCostCurrency | string \| null | Currency code |
| totalCost | string \| null | Total cost |
| totalCostCurrency | string \| null | Currency code |
| condition | string \| null | e.g. "Good", "Damaged" |
| status | string \| null | e.g. "Delivered", "On order" |
| notes | string \| null | Additional notes |

> Note: The Zod schema on the mobile client uses a simplified subset (name, quantity, status, notes) for validation.

### equipment (nested in activities)

| Field | Type | Description |
|-------|------|-------------|
| name | string | e.g. "20T excavator", "Tower crane" |
| quantity | string \| null | Number of units |
| cost | string \| null | Rental/usage cost |
| costCurrency | string \| null | Currency code |
| condition | string \| null | e.g. "Operational", "Needs repair" |
| ownership | string \| null | e.g. "Rented", "Owned" |
| status | string \| null | e.g. "Active", "Idle" |
| hoursUsed | string \| null | e.g. "8 hrs" |
| notes | string \| null | Additional notes |

### issues (top-level and nested in activities)

| Field | Type | Description |
|-------|------|-------------|
| title | string | Short description |
| category | string | e.g. "safety", "quality", "schedule", "other" |
| severity | string | `high`, `medium`, `low` |
| status | string | e.g. "open", "resolved", "monitoring" |
| details | string | Full description |
| actionRequired | string \| null | What needs to be done |
| sourceNoteIndexes | number[] | Source voice notes |

### siteConditions (array)

| Field | Type | Description |
|-------|------|-------------|
| topic | string | e.g. "Access Roads", "Drainage" |
| details | string | Condition description |

### nextSteps (string array)

Plain action items, e.g. `["Order additional N12 reo", "Schedule crane for Thursday"]`.

### sections (array)

Freeform sections for content that doesn't fit the structured fields.

| Field | Type | Description |
|-------|------|-------------|
| title | string | Section heading |
| content | string | Markdown content |
| sourceNoteIndexes | number[] | Source voice notes |

## Database Storage

Reports are stored in the `reports` table:

- `notes` (`text[]`): the raw voice-transcribed notes
- `report_data` (`jsonb`): the full `GeneratedSiteReport` JSON
- `report_type`: denormalised from `report.meta.reportType`
- `title`: denormalised from `report.meta.title`
- `visit_date`: denormalised from `report.meta.visitDate`
- `confidence` (`smallint`): completeness score 0–100 (planned for removal)
- `status`: `draft` or `final`
