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

# Set secrets
supabase secrets set \
  AI_PROVIDER=openai \
  OPENAI_API_KEY=sk-... \
  ANTHROPIC_API_KEY=sk-ant-... \
  GOOGLE_AI_API_KEY=AI... \
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
| `PLAYGROUND_ACCESS_KEY` | Supabase secret | Access key validated by the `generate-report-playground` edge function (constant-time compare) |

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
| `OPENAI_API_KEY` (secret) | OpenAI API key |
| `ANTHROPIC_API_KEY` (secret) | Anthropic API key |
| `GOOGLE_AI_API_KEY` (secret) | Google AI API key |
| `MOONSHOT_API_KEY` (secret) | Kimi/Moonshot API key |
| `ZAI_API_KEY` (secret) | Z.AI (GLM) API key |
| `DEEPSEEK_API_KEY` (secret) | DeepSeek API key |
| `VERCEL_WEB_PROJECT_ID` (var) | Vercel project ID for web app |
| `VITE_SUPABASE_URL` (var) | Supabase URL (for Vercel builds) |
| `VITE_SUPABASE_ANON_KEY` (var) | Supabase anon key (for Vercel builds) |
