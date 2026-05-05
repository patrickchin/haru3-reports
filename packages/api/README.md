# @harpa/api

REST API server for Harpa Pro. See
[`docs/features/rest-api-migration.md`](../../docs/features/rest-api-migration.md)
for the migration plan and
[`docs/features/rest-api-migration-test-plan.md`](../../docs/features/rest-api-migration-test-plan.md)
for the test strategy.

## Status

**Phase 0** — scaffold only. Provides:

- Hono app skeleton (`src/app.ts`) with CORS, request-id, and error
  handling middleware.
- `GET /v1/health` liveness/readiness endpoint (used by Fly.io health
  checks and the migration smoke test).
- Drizzle schema mirror of the core Supabase tables (`src/db/schema.ts`).
  Migrations remain owned by `supabase/migrations/`.
- Vitest unit + integration configs.
- Dockerfile (multi-stage, non-root, ~80 MB) and `fly.toml` ready for
  `flyctl deploy`.

No business routes yet — `sync`, `reports/generate`, and
`audio/transcribe` land in P2–P5.

## Local development

```bash
pnpm install
cp packages/api/.env.example packages/api/.env
# Edit DATABASE_URL etc. (Supabase local stack works out of the box.)

pnpm --filter @harpa/api dev      # tsx watch on src/index.ts
pnpm --filter @harpa/api test     # unit tests
pnpm --filter @harpa/api typecheck
```

The health endpoint works without a DB:

```bash
curl http://localhost:8080/v1/health
# { "status": "ok", "db": "not_configured", ... }
```

## Deploy

CI deploys on push to `main` via
[`.github/workflows/api-deploy.yml`](../../.github/workflows/api-deploy.yml).

### One-time provisioning

The Fly.io app shell `harpa-api` (org `personal`, region `fra` —
Frankfurt, colocated with the Supabase EU project) has been created
(`flyctl apps create harpa-api`). It has no secrets and no machines
yet — first deploy from CI / local will spin up the first machine.

Before the first deploy, populate **Doppler `harpa-pro/production`**
with at minimum:

| Var | Source |
| --- | --- |
| `DATABASE_URL` | Supabase project → Settings → Database → connection string (transaction-mode pooler, port `6543`, `sslmode=require`) |
| `SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → `service_role` |
| `ALLOWED_ORIGINS` | Comma-separated playground origins, e.g. `https://playground.harpa.pro` |
| `REVIEW_ACCESS_KEY` | Random 32+ char string. Required by `/v1/playground/generate`. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, … | Per-provider keys |

Then push them into Fly:

```bash
./scripts/sync-fly-secrets.sh production    # stages on harpa-api
flyctl deploy --config packages/api/fly.toml --remote-only
```

### Rate limiting (Upstash, optional)

`packages/api/src/middleware/rate-limit.ts` ships with both an
in-memory and an Upstash Redis-backed store. The middleware uses the
Upstash store automatically when both `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are set in the environment; otherwise it
uses the in-memory store.

The current `fly.toml` keeps `min_machines_running=1`, so the in-memory
store is correct. **You only need Upstash once you scale to >1 machine
or want sticky rate-limit counters across deploys.**

To provision an Upstash database, the Upstash REST management API needs
HTTP Basic auth `email:UPSTASH_KEY` (the management key is in Doppler
under `UPSTASH_KEY`). Either:

```bash
# Replace YOUR_EMAIL with the email associated with the Upstash account
curl -u "YOUR_EMAIL:$(doppler secrets get UPSTASH_KEY --plain)" \
  -X POST "https://api.upstash.com/v2/redis/database" \
  -H 'Content-Type: application/json' \
  -d '{"name":"harpa-api-ratelimit","region":"eu-central-1","tls":true}' | jq

# Capture endpoint + rest_token from the response, then:
doppler secrets set UPSTASH_REDIS_REST_URL=https://...upstash.io \
  --project harpa-pro --config production
doppler secrets set UPSTASH_REDIS_REST_TOKEN=AX...== \
  --project harpa-pro --config production
./scripts/sync-fly-secrets.sh production
```

Or create the database in the Upstash console UI and paste the REST
URL + REST token into Doppler. The fields are clearly labeled
"REST URL" / "REST Token" in the Upstash dashboard.

### Manual deploy

```bash
flyctl deploy --config packages/api/fly.toml \
  --dockerfile packages/api/Dockerfile --remote-only
```

## Architecture notes

- **Auth**: Supabase JWTs verified via JWKS (P1). Test environment uses
  HS256 with `TEST_JWT_SECRET`.
- **DB**: Postgres via Drizzle + `postgres-js`. Uses `prepare: false`
  for PgBouncer transaction-mode compatibility with Supabase poolers.
- **Defense in depth**: Existing Supabase RLS policies stay in place
  even after the API takes over (see migration plan §5).
- **Schema authority**: `supabase/migrations/*.sql` remains the source
  of truth; `src/db/schema.ts` is a typed mirror.
