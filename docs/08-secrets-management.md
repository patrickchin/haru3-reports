# Secrets Management

Source of truth: **Doppler** (project `harpa-pro`, configs `development` /
`preview` / `production`). From there:

- **Vercel** — native Doppler integration, auto-syncs.
- **Supabase edge function secrets** — native Doppler integration, auto-syncs.
- **EAS env vars** — manual push via [`scripts/sync-eas.mjs`](../scripts/sync-eas.mjs)
  (no native EAS integration exists). Cross-platform Node.js script.

> Goal: change a secret in **one** place; Vercel + Supabase update on their
> own, EAS updates by running one workflow.

## Topology

```
┌──────────────────┐
│     Doppler      │   project: harpa-pro
│                  │   configs: development · preview · production
└────────┬─────────┘
         │
         ├─ native integration ─→ Vercel env vars (auto)
         ├─ native integration ─→ Supabase edge function secrets (auto)
         └─ scripts/sync-eas.mjs <env> ─→ EAS env vars
```

## Doppler config ↔ environment mapping

| Doppler config | GitHub Environment | Git branch     | Vercel env    | EAS env       | Supabase project       |
|----------------|--------------------|----------------|---------------|---------------|------------------------|
| `development`  | `development`      | `dev`          | `development` | `development` | dev project (or branch)|
| `preview`      | `preview`          | (CI / PRs)     | `preview`     | `preview`     | staging project/branch |
| `production`   | `production`       | `main`         | `production`  | `production`  | prod project/branch    |

When Supabase Pro Branching is enabled, `preview` and `development` point at
preview branches of the prod project; only `SUPABASE_*` values change in
Doppler — no code edits needed.

## Variable inventory

Authoritative list. Add new variables in Doppler and update this table. The
EAS sync script picks up only `EXPO_PUBLIC_*`; Vercel and Supabase native
integrations push every variable in the config.

### Server-only (Supabase edge function secrets)

Supabase rejects any secret name starting with `SUPABASE_` in its native
Doppler integration (those vars are reserved and auto-injected). Don't add
any here.

| Variable                    | Used by                                           |
|-----------------------------|---------------------------------------------------|
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
doppler setup            # picks project=harpa-pro, config=development
vercel link              # link the repo to the Vercel project
```

### One-time per maintainer (admin)

1. Create Doppler project `harpa-pro` with configs `development`, `preview`, `production`.
2. Populate variables (see inventory above) in each config.
3. Enable Doppler's **native Vercel integration** (Doppler dashboard →
   Integrations → Vercel) — one integration **per Vercel environment**
   (Development / Preview / Production), each mapped to its matching Doppler
   config.
4. Enable Doppler's **native Supabase integration** (Doppler dashboard →
   Integrations → Supabase). Generate a [Supabase access token](https://app.supabase.com/account/tokens)
   named "Doppler", paste into the integration, then create one sync per
   Supabase project (one per environment). Once configured, every secret
   change in Doppler is pushed to that project's edge function secrets.
5. Create a Doppler **service token per config** (read-only). Add to GitHub
   as a repo secret `DOPPLER_TOKEN` scoped to each Environment.
6. Create GitHub Environments `development`, `preview`, `production` and
   require manual approval on `production`.

## Daily workflow

### Add or rotate a secret

1. Edit the value in Doppler (web UI or `doppler secrets set KEY=value`).
2. Vercel and Supabase update automatically via native integrations.
3. For EAS only: trigger **Actions → Sync EAS env vars → Run workflow**
   (or run `node scripts/sync-eas.mjs development|preview|production` locally).
4. For mobile changes, kick an OTA: `eas update --branch development -m "rotate keys"`.

### Run a local dev session against Doppler

```bash
# Exports Doppler secrets into the process — no .env files needed.
doppler run -- pnpm dev:mobile
doppler run -- pnpm dev:admin
doppler run --command 'supabase functions serve generate-report'
```

### Migrate from `.env.local` files

1. Import existing values: `doppler secrets upload apps/mobile/.env.local --config development`.
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
- After rotation: native integrations push to Vercel/Supabase automatically;
  re-run the EAS sync workflow if any `EXPO_PUBLIC_*` value changed.
