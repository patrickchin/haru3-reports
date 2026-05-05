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
Manual:

```bash
flyctl deploy --config packages/api/fly.toml --dockerfile packages/api/Dockerfile --remote-only
```

Secrets are managed in Doppler (config: `production`). Bulk-load into Fly:

```bash
doppler run --command 'flyctl secrets set \
  DATABASE_URL=$DATABASE_URL \
  SUPABASE_URL=$SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY'
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
