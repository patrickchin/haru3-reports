# Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Mobile App                            │
│  (Expo / React Native / NativeWind)                          │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Auth      │  │ Projects &   │  │ Report Generation      │  │
│  │ (OTP +    │  │ Reports CRUD │  │ (voice notes → AI →    │  │
│  │ profiles) │  │              │  │  structured report)    │  │
│  └─────┬────┘  └──────┬───────┘  └───────────┬────────────┘  │
│        │               │                      │               │
└────────┼───────────────┼──────────────────────┼───────────────┘
         │               │                      │
         ▼               ▼                      ▼
┌──────────────────────────────────────────────────────────────┐
│                     Supabase Backend                         │
│                                                              │
│  ┌────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │ Auth       │  │ PostgreSQL     │  │ Edge Functions      │  │
│  │ (phone OTP)│  │ (profiles,     │  │ (Deno)             │  │
│  │            │  │  projects,     │  │                     │  │
│  │            │  │  reports)      │  │ • generate-report   │  │
│  └────────────┘  └────────────────┘  └─────────┬──────────┘  │
│                                                │              │
└────────────────────────────────────────────────┼──────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │   AI Providers          │
                                    │                         │
                                    │  • Kimi (default)       │
                                    │  • OpenAI (gpt-4o-mini) │
                                    │  • Anthropic (Claude)   │
                                    │  • Google (Gemini Flash)│
                                    └────────────────────────┘
```

## Apps

| App | Path | Stack | Purpose |
|-----|------|-------|---------|
| Mobile | `apps/mobile` | Expo 55, React Native, NativeWind, TanStack Query | Field reporting: voice notes, report generation, project management |
| Playground | `apps/playground` | Vite, React | Gated internal tool for testing `generate-report` with custom notes, providers, and API keys |

## Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@harpa/report-core` | `packages/report-core` | Shared Zod schemas and helpers for `GeneratedSiteReport`. Consumed by `apps/mobile` and `apps/playground` via `workspace:*`. |

## Backend

**Supabase** provides auth, database, and edge functions in a single platform.

### Database (PostgreSQL)

Core tables with RLS (row-level security) — users can only access their own data, with teammate access mediated through `project_members`:

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | id, phone, full_name, company_name | Created automatically via trigger on `auth.users` insert. Teammate visibility is exposed through RPCs, not broad RLS. |
| `projects` | id, owner_id, name, address, client_name, status | Status: active / delayed / completed / archived. Soft-deleted via `deleted_at`. |
| `reports` | id, project_id, owner_id, title, report_type, status, visit_date, confidence, notes, report_data | `notes` is `text[]`, `report_data` is `jsonb` (the generated report). Soft-deleted via `deleted_at`. |
| `project_members` | project_id, user_id, role | Grants teammates access to a project (roles: `owner`, `editor`, `viewer`). |
| `token_usage` | id, user_id, provider, model, input_tokens, output_tokens, cost_usd, created_at | Per-generation usage log backing the profile usage card and history screen. |

Migrations live in `supabase/migrations/`.

### Edge Functions (Deno)

| Function | Purpose |
|----------|---------|
| `generate-report` | Takes voice notes + optional existing report, calls an AI provider, returns a structured report. Verifies caller auth from JWT. |
| `generate-report-playground` | Gated variant used by `apps/playground`. Validates an access key server-side, enforces per-IP rate limiting (30 req/min), and accepts caller-supplied provider/API key. |

### Auth

Phone OTP via Supabase Auth. A database trigger creates a `profiles` row on first sign-in. Demo users (Mike Torres, Sarah Chen) are available in dev via seed data.

## Report Generation Flow

```
1. User speaks voice notes on-site → stored as string[] in app state
2. App calls generate-report edge function with:
   - notes: string[]
3. Edge function:
   a. Selects AI provider from AI_PROVIDER env var
   b. Builds prompt: SYSTEM_PROMPT + NOTES
   c. Calls generateText() via Vercel AI SDK
   d. Parses JSON response and validates against the report schema (parseLLMReport → parseGeneratedSiteReport)
   e. Returns the full GeneratedSiteReport
4. Mobile client validates response with Zod schemas (normalizeGeneratedReportPayload)
5. User reviews/edits sections, then saves to reports.report_data
```

### Key Optimisations

- **Prompt caching** (Anthropic): system prompt cached for 5 min via `providerOptions`
- **Manual regeneration**: the user explicitly triggers regeneration from the notes tab; the LLM always rebuilds the report from the full notes set
- **Minified JSON output**: LLM instructed to omit null/empty fields

## CI/CD

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `generate-report.yml` | Push/PR to main/dev (functions changes) | Unit tests + basic integration tests (Kimi) |
| `generate-report-advanced.yml` | Push/PR to main/dev (functions changes) | Advanced integration tests (Kimi) |
| `mobile-tests.yml` | Push/PR to main/dev (mobile changes) | Vitest unit tests + coverage |
| `eas-update.yml` | Push to main/dev (mobile changes) | OTA update via EAS Update |

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Mobile framework | Expo 55 / React Native |
| Mobile styling | NativeWind (Tailwind CSS) |
| Mobile state | TanStack Query |
| Navigation | Expo Router (file-based) |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Edge runtime | Deno |
| AI SDK | Vercel AI SDK (`ai` package) |
| Schema validation | Zod (mobile client) |
| Monorepo | pnpm workspaces + Turborepo |
| CI/CD | GitHub Actions + EAS Build/Update |
| E2E testing | Maestro |
