# Secrets Management

Source of truth: **Doppler** (project `harpa-pro`, configs `dev` / `stg` /
`prd`). From there we sync to Supabase (edge function secrets), Vercel (web
env vars), and EAS (mobile env vars).

> Goal: change a secret in **one** place; everywhere else updates by running a
> single command (or clicking *Run workflow* on GitHub).

## Topology

```
┌──────────────────┐
│     Doppler      │   project: harpa-pro
│                  │   configs: dev · stg · prd
└────────┬─────────┘
         │  scripts/sync-secrets.sh <config>
         ├──────────────► Supabase edge function secrets (per project ref)
         ├──────────────► Vercel env vars  (development | preview | production)
         └──────────────► EAS env vars     (development | preview | production)
```

## Doppler config ↔ environment mapping

| Doppler config | GitHub Environment | Git branch     | Vercel env    | EAS env       | Supabase project       |
|----------------|--------------------|----------------|---------------|---------------|------------------------|
| `dev`          | `development`      | `dev`          | `development` | `development` | dev project (or branch)|
| `stg`          | `staging`          | (CI / PRs)     | `preview`     | `preview`     | staging project/branch |
| `prd`          | `production`       | `main`         | `production`  | `production`  | prod project/branch    |

When Supabase Pro Branching is enabled, `stg` and `dev` point at preview
branches of the prod project; only `SUPABASE_*` values change in Doppler — no
code edits needed.

## Variable inventory

Authoritative list. Add new variables to Doppler **and** update this table and
`scripts/sync-secrets.sh`.

### Server-only (Supabase edge function secrets)

| Variable                    | Used by                                           |
|-----------------------------|---------------------------------------------------|
| `SUPABASE_PROJECT_REF`      | sync script (selects target project)              |
| `AI_PROVIDER`               | `generate-report` default provider                |
| `OPENAI_API_KEY`            | `generate-report`, `transcribe-audio`             |
| `ANTHROPIC_API_KEY`         | `generate-report`                                 |
| `GOOGLE_AI_API_KEY`         | `generate-report`                                 |
| `MOONSHOT_API_KEY`          | `generate-report` (Kimi default + CI)             |
| `GROQ_API_KEY`              | `transcribe-audio`                                |
| `TRANSCRIPTION_PROVIDER`    | `transcribe-audio` default                        |
| `REVIEW_ACCESS_KEY`         | `generate-report-playground` access gate          |
| `ADMIN_WEB_DISPLAY_NAME`    | `_shared/admin.ts`                                |
| `ADMIN_WEB_USERNAME`        | admin auth                                        |
| `ADMIN_WEB_PASSWORD`        | admin auth                                        |
| `ADMIN_WEB_JWT_SECRET`      | admin auth                                        |
| `TWILIO_ACCOUNT_SID`        | phone OTP                                         |
| `TWILIO_AUTH_TOKEN`         | phone OTP                                         |
| `TWILIO_CONTENT_SID`        | phone OTP                                         |
| `TWILIO_MESSAGE_SERVICE_SID`| phone OTP                                         |
| `TWILIO_VERIFY_SERVICE_SID` | phone OTP                                         |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL`, and `SUPABASE_JWKS` are injected by Supabase into edge
functions automatically — do **not** set them manually.

### Web (Vercel)

| Variable                | Used by                          |
|-------------------------|----------------------------------|
| `VITE_SUPABASE_URL`     | `apps/admin`, `apps/playground`  |
| `VITE_SUPABASE_ANON_KEY`| `apps/admin`, `apps/playground`  |

### Mobile (EAS)

| Variable                       | Visibility   | Used by         |
|--------------------------------|--------------|-----------------|
| `EXPO_PUBLIC_SUPABASE_URL`     | plaintext    | `apps/mobile`   |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`| plaintext    | `apps/mobile`   |
| `EXPO_PUBLIC_SENTRY_DSN`       | sensitive    | `apps/mobile`   |

## Initial setup

### One-time per developer

```bash
brew install dopplerhq/cli/doppler jq
npm i -g vercel eas-cli supabase

doppler login
doppler setup            # picks project=harpa-pro, config=dev
vercel link              # link the repo to the Vercel project
```

### One-time per maintainer (admin)

1. Create Doppler project `harpa-pro` with configs `dev`, `stg`, `prd`.
2. Populate variables (see inventory above) in each config.
3. Enable Doppler's **native Vercel integration** (Doppler dashboard →
   Integrations → Vercel) for one-way auto-sync — this can replace the Vercel
   step in the script entirely.
4. Enable Doppler's **GitHub Actions integration** so Action runs read secrets
   directly via `doppler run -- ...` instead of hand-mapping `secrets.*`.
5. Create a Doppler **service token per config** (read-only). Add to GitHub:
   - Repo secret `DOPPLER_TOKEN_DEV`, `DOPPLER_TOKEN_STG`, `DOPPLER_TOKEN_PRD`
     (or scope per-Environment as `DOPPLER_TOKEN`).
6. Create GitHub Environments `development`, `staging`, `production` and require
   approval on `production`.

## Daily workflow

### Add or rotate a secret

1. Edit the value in Doppler (web UI or `doppler secrets set KEY=value`).
2. Run sync: `./scripts/sync-secrets.sh dev` (or trigger
   **Actions → Sync Secrets → Run workflow**).
3. For mobile changes, kick an OTA: `eas update --branch development -m "rotate keys"`.

### Run a local dev session against Doppler

```bash
# Exports Doppler secrets into the process — no .env files needed.
doppler run -- pnpm dev:mobile
doppler run -- pnpm dev:admin
doppler run --command 'supabase functions serve generate-report'
```

### Migrate from `.env.local` files

1. Import existing values: `doppler secrets upload apps/mobile/.env.local --config dev`.
2. Delete the `.env.local` (already gitignored) once `doppler run` works.

## CI usage

Workflows that need secrets should prefer `doppler run`:

```yaml
- uses: dopplerhq/cli-action@v3
- env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
  run: doppler run --command 'pnpm test'
```

This drops the per-secret `secrets.FOO` plumbing in
[mobile-tests.yml](../.github/workflows/mobile-tests.yml) and keeps the
inventory in one place.

## Rotation policy

- AI provider keys: rotate every 90 days or on suspicion of leak.
- Supabase service-role / anon: rotate after any contributor offboard.
- After rotation: run `sync-secrets` for every affected config and verify
  `supabase functions invoke` and a mobile OTA pull both succeed.
