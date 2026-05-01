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
│  │            │  │  projects,     │  │ • generate-report   │  │
│  │            │  │  reports,      │  │ • generate-report-  │  │
│  │            │  │  report_notes, │  │     playground      │  │
│  │            │  │  file_metadata)│  │ • transcribe-audio  │  │
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

### Mobile audio behaviour

- Voice-note playback is coordinated globally in `useVoiceNotePlayer`, so starting one note pauses any other in-app voice note that is currently playing.
- Voice-note playback configures Expo Audio runtime mode with `playsInSilentMode: true`, `shouldPlayInBackground: true`, and `interruptionMode: 'doNotMix'` so playback can continue in the background and requests exclusive audio focus from the OS.
- OS-level background persistence / media-session behaviour still requires on-device verification, especially Android lock-screen/background limits noted by Expo Audio.

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
| `reports` | id, project_id, owner_id, title, report_type, status, visit_date, confidence, report_data | `report_data` is `jsonb` (the generated report). Soft-deleted via `deleted_at`. Source notes live in `report_notes`. |
| `report_notes` | id, report_id, owner_id, body, transcript, sort_order, created_at | One row per voice / typed note. Supersedes the legacy `reports.notes text[]` column (dropped in `202604300003`). |
| `file_metadata` | id, report_id, owner_id, kind, storage_path, mime_type, size_bytes, width, height, thumbnail_path, blurhash | Photos, audio recordings, and other attachments stored alongside reports. Image rows additionally carry pixel dimensions, the storage path of a small JPEG thumbnail (`<storage_path>.thumb.jpg`), and a BlurHash placeholder string — see [Image performance](#image-performance) below. |
| `project_members` | project_id, user_id, role | Grants teammates access to a project (roles: `owner`, `editor`, `viewer`). |
| `token_usage` | id, user_id, provider, model, input_tokens, output_tokens, cost_usd, created_at | Per-generation usage log backing the profile usage card and history screen. |

Migrations live in `supabase/migrations/`.

### Edge Functions (Deno)

| Function | Purpose |
|----------|---------|
| `generate-report` | Takes voice notes + optional existing report, calls an AI provider, returns a structured report. Verifies caller auth from JWT. |
| `generate-report-playground` | Gated variant used by `apps/playground`. Validates an access key server-side, enforces per-IP rate limiting (30 req/min), and accepts caller-supplied provider/API key. |
| `transcribe-audio` | Transcribes uploaded voice notes via Groq / OpenAI Whisper / Deepgram (selected via `TRANSCRIPTION_PROVIDER`). Verifies caller auth from JWT. |
| `backfill-file-thumbnails` | One-shot admin function that walks legacy `file_metadata` image rows missing `thumbnail_path` or `blurhash`, decodes the original via [`imagescript`](https://deno.land/x/imagescript), uploads `<storage_path>.thumb.jpg`, encodes a BlurHash from a 32px copy, and patches `width` / `height` / `thumbnail_path` / `blurhash` on the row. Service-role-only. Supports `dryRun: true`. |

### Auth

Phone OTP via Supabase Auth. A database trigger creates a `profiles` row on first sign-in. Demo users (Mike Torres, Sarah Chen) are available in dev via seed data.

## Report Generation Flow

```
1. User records voice notes on-site → audio uploaded to Supabase Storage,
   transcribed via the `transcribe-audio` edge function, stored as rows in
   `report_notes`.
2. App calls `generate-report` edge function with:
   - notes: string[] (the full set of transcripts + typed notes)
   - provider, model (optional)
3. Edge function:
   a. Selects AI provider (request body → `AI_PROVIDER` env → default `kimi`)
   b. Builds prompt: SYSTEM_PROMPT + NOTES
   c. Calls generateText() via Vercel AI SDK
   d. Parses JSON response and validates against the report schema
      (parseLLMReport → parseGeneratedSiteReport)
   e. Returns the full GeneratedSiteReport
4. Mobile client validates response with Zod schemas
   (normalizeGeneratedReportPayload)
5. User reviews/edits sections, then saves to `reports.report_data`.
```

### Key Optimisations

- **Prompt caching** (Anthropic): system prompt cached for 5 min via `providerOptions`
- **Manual regeneration**: the user explicitly triggers regeneration from the notes tab; the LLM always rebuilds the report from the full notes set
- **Minified JSON output**: LLM instructed to omit null/empty fields

## Image performance

All image rendering on mobile goes through `apps/mobile/components/ui/CachedImage.tsx` — a thin wrapper around [`expo-image`](https://docs.expo.dev/versions/latest/sdk/image/) that adds:

- `cachePolicy="disk"` so pixels persist across app launches.
- A `cacheKey` (the storage path) merged into the source object so rotating signed-URL tokens don't invalidate the cache.
- Aspect-ratio reservation from `intrinsicWidth` / `intrinsicHeight` to prevent layout shift while loading.
- A two-stage placeholder: an explicit `placeholder` (typically the small JPEG thumbnail signed URL) takes priority; otherwise the `blurhash` is rendered immediately so the user always sees something.
- A telemetry hook (`recordImageLoad`) recording `cacheKey`, `durationMs`, and `source` (`cache` / `network`) on every load. The sink is installed once at app startup in `apps/mobile/app/_layout.tsx` and forwards slow non-cached loads (>1s) to `logClientError`.

At capture time, `apps/mobile/lib/preprocess-image.ts` resizes the original to a 2048px long-edge JPEG, produces a 400px thumbnail, and computes a BlurHash via `Image.generateBlurhashAsync` (4×3 components). All three artefacts plus pixel dimensions are uploaded by `useFileUpload`.

Legacy rows uploaded before the image-perf migrations (`202605010003_file_metadata_image_dims.sql`, `202605010004_file_metadata_blurhash.sql`) are healed by invoking the `backfill-file-thumbnails` edge function in batches.

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
