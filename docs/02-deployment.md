# Deployment

## Environments

| Environment | Branch | Supabase | Web | Mobile |
|-------------|--------|----------|-----|--------|
| **Development** | `dev` | Local (`supabase start`) | — | EAS development build + OTA |
| **Staging** | `main` | Supabase project (staging) | Vercel preview (playground) | EAS preview build + OTA |
| **Production** | `main` | Supabase project (prod) | Vercel prod (playground) | EAS production build |

## Supabase (Backend)

### Initial setup

```bash
# Link to your project
supabase link --project-ref <project-ref>

# Push database migrations
supabase db push

# Deploy edge functions
supabase functions deploy generate-report --no-verify-jwt
supabase functions deploy generate-report-playground --no-verify-jwt
supabase functions deploy transcribe-audio
supabase functions deploy backfill-file-thumbnails

# Set secrets
supabase secrets set \
  AI_PROVIDER=openai \
  TRANSCRIPTION_PROVIDER=groq \
  OPENAI_API_KEY=sk-... \
  ANTHROPIC_API_KEY=sk-ant-... \
  GOOGLE_AI_API_KEY=AI... \
  GROQ_API_KEY=gsk_... \
  DEEPGRAM_API_KEY=... \
  MOONSHOT_API_KEY=sk-... \
  ZAI_API_KEY=... \
  DEEPSEEK_API_KEY=sk-...
```

### Local development

```bash
supabase start        # Starts local Supabase stack (DB, Auth, etc.)
supabase db push      # Apply migrations to local DB
supabase db reset     # Reset local DB and re-apply migrations + seed
```

### One-shot: backfill image metadata

After applying migrations `202605010003_file_metadata_image_dims.sql` and `202605010004_file_metadata_blurhash.sql`, legacy image rows have `width` / `height` / `thumbnail_path` / `blurhash` set to `NULL`. The `backfill-file-thumbnails` edge function heals them in batches.

**Preferred: run from CI.** The `Supabase Deploy` workflow has a manual
`workflow_dispatch` job for this. Pre-requisites:

1. `SERVICE_ROLE_KEY` must be present in the `development` Doppler
   config (see [docs/08-secrets-management.md](./08-secrets-management.md)).
   Note: Doppler reserves the `SUPABASE_` prefix for runtime env vars
   Supabase injects into edge functions, so this secret is named
   without that prefix.
2. The two image-perf migrations must already have been pushed
   (the workflow's `db-push` job covers this on every push to `dev`).

Then in **GitHub → Actions → Supabase Deploy → Run workflow**:

- `target` = `backfill-thumbnails`
- `backfill_batch_size` = `50` (or higher if you have thousands of rows)
- `backfill_dry_run` = `true` for the first run to confirm the row count

The job loops `POST /functions/v1/backfill-file-thumbnails` with the
service-role JWT, summing `processed` / `updated` / `errors` across
iterations and stopping when a batch comes back smaller than
`batchSize` (i.e. the tail). Re-running on a fully-healed database is
a no-op — the `OR thumbnail_path.is.null,blurhash.is.null` filter in
the function returns zero rows.

**Manual fallback** (e.g. testing against a local stack):

```bash
# Always start with a dry run to verify the row count.
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -d '{"batchSize": 25, "dryRun": true}' \
  "$SUPABASE_URL/functions/v1/backfill-file-thumbnails"

# Then run for real, repeatedly, until `processed` returns 0.
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -d '{"batchSize": 50, "dryRun": false}' \
  "$SUPABASE_URL/functions/v1/backfill-file-thumbnails"
```

The function is idempotent: rows that already have both `thumbnail_path` and `blurhash` are excluded by the `OR` filter, so re-running on a healthy database is a no-op.

## Web (Vercel)

The repo's root `vercel.json` builds and deploys `apps/playground`. See the dedicated section below for required env vars.

```bash
pnpm --filter playground build   # Build locally
```

## Playground (Vercel)

Separate Vercel project deployed from the monorepo root (see `vercel.json`). Access is gated server-side at the `generate-report-playground` edge function via an access key.

```bash
pnpm --filter playground build
```

Required environment variables:

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | Vercel | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel | Supabase anonymous key |
| `REVIEW_ACCESS_KEY` | Supabase secret | Access key validated by the `generate-report-playground` edge function (constant-time compare) |

## Mobile (EAS)

> **Always run `eas` commands from `apps/mobile/`.** Running from the repo root
> will fail (no `eas.json` there) — this is intentional. Previously stub
> `eas.json` / `app.json` files at the root silently produced builds with the
> wrong package id (`com.harpapro.harpapro` instead of `com.harpa.pro`), no
> channel binding, and a mismatched runtime version.

### Build profiles

Defined in `apps/mobile/eas.json`:

| Profile | Channel | Distribution | Use case |
|---------|---------|-------------|----------|
| `development` | development | internal | Dev client for local testing |
| `preview` | preview | internal | TestFlight / internal APK for staging |
| `production` | production | store | App Store / Play Store submission |

### Building

```bash
cd apps/mobile

# Development build (includes dev tools)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview build (staging)
eas build --profile preview --platform ios

# Production build
eas build --profile production --platform ios
eas build --profile production --platform android

# Submit to app store
eas submit --profile production --platform ios
```

### OTA Updates

Push JS bundle changes without a full native build:

```bash
cd apps/mobile
eas update --branch development --message "description of changes"
eas update --branch preview --message "description of changes"
```

Environment variables for each EAS environment are configured in the Expo dashboard (or via `eas env:set`).

## CI/CD Workflows

All workflows live in `.github/workflows/`.

### generate-report.yml

**Trigger:** Push/PR to `main` or `dev` when `supabase/functions/generate-report/**` changes.

- Runs Deno unit tests
- Runs basic integration tests against Kimi (requires `MOONSHOT_API_KEY` secret)

### generate-report-advanced.yml

**Trigger:** Same as above.

- Runs advanced integration tests against Kimi with more complex note scenarios

### mobile-tests.yml

**Trigger:** Push/PR to `main` or `dev` when `apps/mobile/**` changes.

- Runs Vitest unit tests
- Generates coverage report

### eas-update.yml

**Trigger:** Push to `main` or `dev` when `apps/mobile/**` changes. Also manual dispatch.

- Publishes an OTA update via EAS Update
- `dev` branch → `development` channel
- `main` branch → `preview` channel

### maestro-smoke.yml

**Trigger:** Nightly at 03:00 UTC, plus manual dispatch.

- Runs against the **latest finished EAS preview Android APK** (release build, not dev client)
- Skips with a notice when no finished preview Android build is available yet
- Boots an Android emulator (`reactivecircus/android-emulator-runner`)
- Installs the APK and runs Maestro flows tagged `smoke`
- Excludes `reports` tag (long LLM call) and runs `android-only` flows in a non-blocking step
- Uploads test artefacts (screenshots, recordings) for 14 days

To test a specific build manually, dispatch the workflow with a `build_id` input from the EAS dashboard.

### Migration linting (in `ci.yml`)

The `migration-lint` job runs on every push and PR. It enforces:
- Filename pattern `YYYYMMDDHHmm_description.sql` (12-digit timestamp + lowercase description)
- No duplicate timestamps across `supabase/migrations/`

This guards against the timestamp-conflict bug fixed in commit `766ba4f` and ensures migrations apply in a deterministic order.

### RLS hosted bucket assertion (in `rls-tests.yml`)

The hosted job (nightly + manual) now also asserts that the `project-files`
and `avatars` buckets exist on the linked project with the expected
visibility, size limits, and MIME restrictions — catching cases where the
file-upload migration is missing or partially applied.

## GitHub Environments & Secrets

Create `development`, `staging`, and `production` environments in GitHub repo settings.

### Repository-level secrets

| Secret | Description |
|--------|-------------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth token |
| `VERCEL_TOKEN` | Vercel deploy token |
| `VERCEL_ORG_ID` | Vercel organisation ID |
| `EXPO_TOKEN` | EAS authentication token |
| `MOONSHOT_API_KEY` | Used by CI integration tests |

### Per-environment variables

| Variable / Secret | Description |
|-------------------|-------------|
| `SUPABASE_DB_PASSWORD` (secret) | Database password |
| `AI_PROVIDER` (var) | Default AI provider for edge function |
| `TRANSCRIPTION_PROVIDER` (var) | Default transcription provider for `transcribe-audio` (`groq`, `openai`, `openai-whisper`, or `deepgram`) |
| `OPENAI_API_KEY` (secret) | OpenAI API key |
| `ANTHROPIC_API_KEY` (secret) | Anthropic API key |
| `GOOGLE_AI_API_KEY` (secret) | Google AI API key |
| `GROQ_API_KEY` (secret) | Groq API key for voice-note transcription |
| `DEEPGRAM_API_KEY` (secret) | Deepgram API key for voice-note transcription |
| `MOONSHOT_API_KEY` (secret) | Kimi/Moonshot API key |
| `ZAI_API_KEY` (secret) | Z.AI (GLM) API key |
| `DEEPSEEK_API_KEY` (secret) | DeepSeek API key |
| `VERCEL_WEB_PROJECT_ID` (var) | Vercel project ID for web app |
| `VITE_SUPABASE_URL` (var) | Supabase URL (for Vercel builds) |
| `VITE_SUPABASE_ANON_KEY` (var) | Supabase anon key (for Vercel builds) |
