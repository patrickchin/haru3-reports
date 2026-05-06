# REST API Migration Plan

> **Status (2026-05-06):** implemented on branch `feat/rest-api-migration`, deployed to `https://harpa-api.fly.dev`, mobile cut over via `EXPO_PUBLIC_USE_REST_API=1` in Doppler[development].
>
> See [retro.md](./retro.md) for what shipped, the bugs we hit (ES256 JWT rotation, `audio` vs `file` field-name drift, jsonb-as-string at the RPC boundary), why the tests missed them, and what we'd do differently if starting over.
>
> Companion: [test-plan.md](./test-plan.md).

## 1. Executive Summary

### Goals

- Replace PostgREST + Deno Edge Functions with a single, self-hosted REST API service
- Gain full control over routing, middleware, rate limiting, and observability
- Eliminate vendor lock-in on the compute layer while retaining Supabase Auth + Storage + Postgres
- Maintain the existing mobile sync protocol (pull-since / apply-mutation) with zero downtime via feature-flag cutover

### Non-Goals

- Migrating away from Supabase Auth (phone OTP stays)
- Migrating away from Supabase Storage (project-files bucket stays)
- Rewriting the mobile sync engine, pull/push loop, or local SQLite layer
- Changing the report Zod schema or AI provider routing logic

### Success Criteria

| Metric | Target |
|--------|--------|
| Mobile P95 latency (pull/apply) | ≤ current PostgREST P95 |
| Generate-report P50 | ≤ current edge-fn P50 (network portion only) |
| Transcribe-audio upload overhead | ≤ 200 ms added vs current |
| Zero-downtime cutover | Feature-flag rollout with instant rollback |
| Test coverage (new API) | ≥ 80 % lines |
| No RLS regression | All existing `rls_*.test.ts` pass against new authz |

---

## 2. Target Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Mobile App (Expo/RN)                         │
│                                                                       │
│  ┌───────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │ Auth (OTP)    │  │ Sync Engine      │  │ Generation / Transcribe│  │
│  │ supabase-js   │  │ pull + push loop │  │ api-client.ts          │  │
│  └───────┬───────┘  └────────┬─────────┘  └────────────┬───────────┘  │
│          │                   │                          │              │
└──────────┼───────────────────┼──────────────────────────┼──────────────┘
           │                   │                          │
           │          ┌────────▼──────────────────────────▼──────────┐
           │          │             REST API (Hono / Node)            │
           │          │                                              │
           │          │  /v1/sync/pull/:table    (cursor pagination) │
           │          │  /v1/sync/apply/:entity  (idempotent upsert) │
           │          │  /v1/reports/generate    (AI proxy)          │
           │          │  /v1/audio/transcribe    (multipart upload)  │
           │          │  /v1/playground/generate (access-key gated)  │
           │          │  /v1/admin/backfill-thumbnails (svc-role)    │
           │          │  /v1/health                                  │
           │          │                                              │
           │          │  Middleware: JWT verify, CORS, rate-limit,   │
           │          │  request-id, Sentry, graceful shutdown       │
           │          │                                              │
           │          └──────┬──────────────────┬────────────────────┘
           │                 │                  │
           │          ┌──────▼──────┐    ┌──────▼──────┐
           │          │  PostgreSQL │    │  AI / STT   │
           │          │  (Supabase) │    │  Providers  │
           │          │  Drizzle ORM│    │             │
           │          └─────────────┘    └─────────────┘
           │
    ┌──────▼──────┐
    │  Supabase   │
    │  Auth       │ ← JWT issuer (unchanged)
    │  Storage    │ ← file uploads (unchanged)
    └─────────────┘
```

---

## 3. Stack Decisions

### HTTP Framework: **Hono**

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| Hono | Tiny, fast, middleware ecosystem, `@hono/zod-openapi`, runs on Node/Bun/CF Workers | Smaller community than Express | **Selected** — best DX for typed, validated APIs |
| Fastify | Mature, schema-based validation, plugin system | Heavier, JSON Schema instead of Zod native | Runner-up |
| Express | Ubiquitous | No built-in types, async error handling awkward | Rejected |
| tRPC | End-to-end type safety | Mobile client uses REST fetch; tRPC adds coupling | Rejected for this use case |

### Database Access: **Drizzle ORM**

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| Drizzle | Type-safe SQL, zero runtime overhead, migrations, raw SQL escape hatch | Newer | **Selected** — lightest ORM with full Postgres support |
| Prisma | Popular, generated client | Heavy runtime, cold-start penalty, opinionated migrations | Rejected |
| Kysely | Lightweight, type-safe query builder | No migration tooling built-in | Runner-up |
| Raw `pg` | Full control | No type safety, verbose | Rejected |

### Auth: **Keep Supabase Auth JWT**

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| Keep Supabase Auth | Zero migration, phone OTP works, JWKS endpoint already trusted by mobile | Vendor dependency on auth issuer | **Selected for P0–P8** |
| Own issuer + Twilio | Full control, no Supabase dependency | 2-4 weeks extra work, session management, key rotation, OTP UX | **P9 optional** |

The API verifies JWTs via Supabase's `/.well-known/jwks.json` endpoint (same as edge functions today). The `sub` claim = `user_id`.

### Storage: **Keep Supabase Storage**

Uploads continue via `supabase-js` on the client. The API reads/writes file metadata in Postgres. Thumbnail backfill uses the service-role key to access storage admin APIs.

### Hosting: **Fly.io (containerized Node 22)**

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| Fly.io | Generous free tier (3 shared-cpu-1x VMs, 3 GB volumes), Docker-native via `fly deploy`, scale-to-zero with `auto_stop_machines`, multi-region available later, built-in private networking (`.internal`), Anycast TLS | CLI-driven (less GUI than Railway), `fly.toml` learning curve | **Selected** — best free-tier-to-paid path; no monthly minimum |
| Cloud Run | Scales to zero, GCP ecosystem | Cold starts, more config, billing requires GCP account | Runner-up |
| Railway | Simple GUI, auto-scaling | $5/mo minimum after trial credit; no real free tier | Rejected (cost) |
| Render | Simple | Slower deploys, no private networking, free tier sleeps aggressively | Rejected |

### Validation: **Zod + `@hono/zod-openapi`**

Reuses existing Zod schemas from `@harpa/report-core`. OpenAPI spec generated automatically from route definitions — enables SDK generation and Swagger UI.

### Background Jobs: **BullMQ + Upstash Redis**

For thumbnail backfill and potential future async tasks (PDF export, batch generation). Fly.io has no native Redis add-on, so we use **Upstash Redis** (HTTP-based, generous free tier: 10k commands/day, 256 MB) — also doubles as the rate-limit backend. For P0–P5, jobs remain synchronous in the request handler (matching current edge function behavior). BullMQ introduced in P6 for batch operations; if BullMQ's TCP requirement becomes inconvenient against Upstash REST, fall back to a simpler `pg`-based outbox queue.

---

## 4. API Surface — Endpoint Catalog

### Sync Pull Endpoints

| Method | Path | Auth | Current RPC | Request | Response | Pagination | Idempotent |
|--------|------|------|-------------|---------|----------|------------|------------|
| GET | `/v1/sync/pull/projects` | Bearer JWT | `pull_projects_since` | `?cursor=<ISO>&limit=500` | `{ rows: Project[], nextCursor: string \| null }` | Cursor (updated_at ASC) | Yes (read) |
| GET | `/v1/sync/pull/reports` | Bearer JWT | `pull_reports_since` | `?cursor=<ISO>&limit=500` | `{ rows: Report[], nextCursor: string \| null }` | Cursor | Yes |
| GET | `/v1/sync/pull/project_members` | Bearer JWT | `pull_project_members_since` | `?cursor=<ISO>&limit=500` | `{ rows: ProjectMember[], nextCursor: string \| null }` | Cursor | Yes |
| GET | `/v1/sync/pull/file_metadata` | Bearer JWT | `pull_file_metadata_since` | `?cursor=<ISO>&limit=500` | `{ rows: FileMetadata[], nextCursor: string \| null }` | Cursor | Yes |
| GET | `/v1/sync/pull/report_notes` | Bearer JWT | `pull_report_notes_since` | `?cursor=<ISO>&limit=500` | `{ rows: ReportNote[], nextCursor: string \| null }` | Cursor | Yes |

### Sync Apply Endpoints

| Method | Path | Auth | Current RPC | Request Body | Response | Idempotent |
|--------|------|------|-------------|--------------|----------|------------|
| POST | `/v1/sync/apply/project` | Bearer JWT | `apply_project_mutation` | `{ client_op_id, op, id, base_version?, fields }` | `{ status, server_version, row }` | Yes (client_op_id) |
| POST | `/v1/sync/apply/report` | Bearer JWT | `apply_report_mutation` | `{ client_op_id, op, id, base_version?, fields }` | `{ status, server_version, row }` | Yes |
| POST | `/v1/sync/apply/file_metadata` | Bearer JWT | `apply_file_metadata_mutation` | `{ client_op_id, op, id, base_version?, fields }` | `{ status, server_version, row }` | Yes |
| POST | `/v1/sync/apply/report_note` | Bearer JWT | `apply_report_note_mutation` | `{ client_op_id, op, id, base_version?, fields }` | `{ status, server_version, row }` | Yes |

### AI / Media Endpoints

| Method | Path | Auth | Current Edge Fn | Request | Response | Rate Limit | Idempotent |
|--------|------|------|-----------------|---------|----------|------------|------------|
| POST | `/v1/reports/generate` | Bearer JWT | `generate-report` | `{ notes: string[], provider?, model?, projectId?, existingReport? }` | `{ report, usage, systemPrompt, userPrompt }` | 10 req/min/user | No |
| GET | `/v1/reports/generate/providers` | Bearer JWT | `generate-report` GET | — | `{ providers: string[], models: Record }` | — | Yes |
| POST | `/v1/audio/transcribe` | Bearer JWT | `transcribe-audio` | `multipart/form-data { audio: File, provider?, language? }` | `{ text, provider, model, durationMs }` | 20 req/min/user | No |
| GET | `/v1/audio/transcribe/providers` | Bearer JWT | `transcribe-audio` GET | — | `{ providers, all, default }` | — | Yes |
| POST | `/v1/playground/generate` | x-playground-key | `generate-report-playground` | `{ notes, provider?, model?, apiKey?, systemPrompt? }` | `{ report, usage, ... }` | 30 req/min/IP | No |

### Admin Endpoints

| Method | Path | Auth | Current Edge Fn | Request | Response |
|--------|------|------|-----------------|---------|----------|
| POST | `/v1/admin/backfill-thumbnails` | Service-role key | `backfill-file-thumbnails` | `{ batchSize?, dryRun? }` | `{ processed, updated, skipped, errors }` |

### Infrastructure

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/v1/health` | None | Liveness + readiness probe |
| GET | `/v1/openapi.json` | None | Generated OpenAPI 3.1 spec |

---

## 5. Authorization Model

### RLS: Keep vs Replace

**Decision**: Replace RLS enforcement with **application-level authz** in the API layer. Rationale:

1. The current SECURITY DEFINER RPCs already bypass RLS and enforce ownership/membership in procedural code — the API replicates this logic in TypeScript.
2. Application-level authz is testable with unit tests (faster feedback than hitting Postgres).
3. RLS policies on the tables remain **enabled as a defense-in-depth backstop** — the API connects with a scoped role (`api_service`) that still respects SELECT/INSERT/UPDATE/DELETE policies, but the API's WHERE clauses are the primary enforcement mechanism.

### Per-Route Authorization Rules

| Route | Rule |
|-------|------|
| `pull/projects` | `owner_id = userId OR project_members.user_id = userId` |
| `pull/reports` | `owner_id = userId OR project_members(project_id).user_id = userId` |
| `pull/project_members` | User is a member of the project |
| `pull/file_metadata` | Project owner OR project member |
| `pull/report_notes` | Report owner OR project member |
| `apply/project` INSERT | Forced `owner_id = userId` |
| `apply/project` UPDATE/DELETE | `owner_id = userId` |
| `apply/report` INSERT | Caller owns the parent project |
| `apply/report` UPDATE | Owner OR editor member of parent project |
| `apply/report` DELETE | Owner only |
| `apply/file_metadata` | Owner of parent project |
| `apply/report_note` INSERT | Owner of parent report's project |
| `apply/report_note` UPDATE/DELETE | Owner of the note |
| `reports/generate` | Authenticated user (usage logged) |
| `audio/transcribe` | Authenticated user |
| `playground/generate` | Valid `x-playground-key` header |
| `admin/*` | Service-role key (constant-time compare) |

### Porting SECURITY DEFINER Functions

Each SECURITY DEFINER RPC becomes a **service function** in the API that:
1. Runs the ownership/membership check in a single query (no extra round-trip).
2. Uses Drizzle transactions with `SERIALIZABLE` isolation for apply mutations.
3. Records `client_ops` in the same transaction (idempotency).
4. Returns the same response shape (`{ status, server_version, row }`).

The `client_ops` table and GC cron remain in Postgres unchanged.

---

## 6. Phased Plan

### P0 — Scaffold

**Scope**: Monorepo package, Hono app, Drizzle schema, CI, Docker, deploy to Fly.io (no traffic).

**Files**:
- `packages/api/` — new workspace package
- `packages/api/package.json`
- `packages/api/tsconfig.json`
- `packages/api/src/index.ts` (Hono app entry)
- `packages/api/src/middleware/` (cors, auth, request-id, error-handler)
- `packages/api/src/db/` (Drizzle schema mirroring existing tables)
- `packages/api/src/db/drizzle.config.ts`
- `packages/api/Dockerfile`
- `packages/api/fly.toml` (Fly.io app config — region, VM size, health check, auto-stop)
- `packages/api/.dockerignore`
- `packages/api/vitest.config.ts`
- `pnpm-workspace.yaml` (add `packages/api`)
- `.github/workflows/api-ci.yml`
- `.github/workflows/api-deploy.yml` (uses `superfly/flyctl-actions/setup-flyctl` + `flyctl deploy`)

**Steps**:
1. `pnpm --filter api init` and scaffold Hono + Drizzle.
2. Mirror Postgres schema as Drizzle table definitions (introspect from `supabase db dump`).
3. Add health endpoint, CORS, request-id middleware.
4. Dockerfile (Node 22 Alpine, multi-stage build).
5. `flyctl launch --no-deploy` to generate `fly.toml`; pick region matching Supabase project (e.g. `iad` for us-east). Configure `[[services]]` health check on `/v1/health`, `auto_stop_machines = true`, `min_machines_running = 1` for prod (avoids cold starts) and `0` for staging (free tier).
6. `fly secrets set` from Doppler (or use `doppler run -- flyctl secrets set` to bulk-load).
7. CI: lint, type-check, test (empty suite passes). Add `FLY_API_TOKEN` to GitHub Environment secrets.

**Rollback**: `flyctl apps destroy <app>` and delete the package.

**Validation**: `GET https://<app>.fly.dev/v1/health` returns `200 { status: "ok" }`.

---

### P1 — JWT Auth Middleware

**Scope**: Verify Supabase JWTs, extract `userId`, reject unauthenticated requests.

**Files**:
- `packages/api/src/middleware/auth.ts`
- `packages/api/src/middleware/auth.test.ts`
- `packages/api/src/lib/jwks.ts` (cached JWKS fetch via `jose`)

**Steps**:
1. Install `jose` (same lib as edge functions).
2. Implement middleware: extract Bearer token, verify via Supabase JWKS, attach `userId` to Hono context.
3. Cache JWKS for 1 hour (avoid per-request network call).
4. Unit tests with mocked JWKS.
5. Integration test against local Supabase auth (create test user, get token, verify).

**Rollback**: Revert middleware; routes remain unprotected (no traffic yet).

**Validation**: Unauthenticated → 401; valid token → 200; expired token → 401.

---

### P2 — Sync Pull Endpoints

**Scope**: All five `pull_*_since` queries as REST GET endpoints.

**Files**:
- `packages/api/src/routes/sync/pull.ts`
- `packages/api/src/services/pull.ts` (Drizzle queries)
- `packages/api/src/routes/sync/pull.test.ts`
- `packages/api/src/services/pull.test.ts`

**Steps**:
1. Define Zod request schemas (query params: `cursor`, `limit`).
2. Implement Drizzle queries replicating SECURITY DEFINER logic (ownership + membership checks).
3. Return `{ rows, nextCursor }` envelope.
4. Integration tests against Postgres with seeded data.
5. Verify soft-deleted rows included (tombstones).
6. Limit clamped to `[1, 1000]`.

**Rollback**: Remove routes; mobile still using Supabase RPCs.

**Validation**: Seed 2 users with projects/reports. User A cannot see User B's data. Soft-deleted rows appear. Cursor pagination works across pages.

---

### P3 — Sync Apply Endpoints

**Scope**: All four `apply_*_mutation` handlers with idempotency.

**Files**:
- `packages/api/src/routes/sync/apply.ts`
- `packages/api/src/services/apply/project.ts`
- `packages/api/src/services/apply/report.ts`
- `packages/api/src/services/apply/file-metadata.ts`
- `packages/api/src/services/apply/report-note.ts`
- `packages/api/src/services/apply/shared.ts` (idempotency check/record)
- `packages/api/src/routes/sync/apply.test.ts`

**Steps**:
1. Zod request schemas per entity.
2. Drizzle transactional apply: idempotency check → authz → insert/update/delete → record `client_ops`.
3. Conflict detection via `base_version` (optimistic concurrency).
4. Return `{ status: 'applied'|'conflict'|'duplicate'|'forbidden', server_version, row }`.
5. Integration tests: happy path, conflict, duplicate replay, forbidden.

**Rollback**: Remove routes.

**Validation**: Full round-trip: apply INSERT → pull → verify row. Replay same `client_op_id` → `duplicate`. Stale `base_version` → `conflict`.

---

### P4 — Generate Report

**Scope**: Port `generate-report` edge function to Hono route.

**Files**:
- `packages/api/src/routes/reports/generate.ts`
- `packages/api/src/services/ai/generate-report.ts` (ported from edge fn)
- `packages/api/src/services/ai/providers.ts`
- `packages/api/src/services/ai/llm.ts`
- `packages/api/src/routes/reports/generate.test.ts`

**Steps**:
1. Port `SYSTEM_PROMPT`, `PROVIDER_MODELS`, `fetchReportFromLLM`, `parseLLMReport` to Node-compatible modules (replace `Deno.env` with `process.env`).
2. Replace Deno-specific imports (`jsr:`, `npm:`) with regular npm packages (already the same libs).
3. Implement route: validate body, resolve provider/model, call LLM, parse, return.
4. Token usage logging to `token_usage` table via Drizzle.
5. Unit test with mocked `generateText`. Integration test with Kimi (CI provider).
6. Fixture mode (`USE_FIXTURES=true`) for E2E.

**Rollback**: Remove route; mobile continues calling edge function.

**Validation**: `POST /v1/reports/generate` with sample notes → valid `GeneratedSiteReport`.

---

### P5 — Transcribe Audio

**Scope**: Port `transcribe-audio` to Hono multipart endpoint.

**Files**:
- `packages/api/src/routes/audio/transcribe.ts`
- `packages/api/src/services/audio/transcribe.ts`
- `packages/api/src/services/audio/providers.ts` (Groq, OpenAI, Deepgram)
- `packages/api/src/routes/audio/transcribe.test.ts`

**Steps**:
1. Hono multipart parsing (`hono/body` or `@hono/multipart`).
2. Port provider resolution + transcription logic.
3. Fixture mode for E2E (`FIXTURES_DELAY_MS`).
4. Rate limit: 20 req/min/user.
5. Integration test with mocked provider.

**Rollback**: Remove route.

**Validation**: Upload `.m4a` file → receive transcript text.

---

### P6 — Playground + Admin + Files/Storage

**Scope**: Port `generate-report-playground` (access-key gated, IP rate-limit 30/min). Port `backfill-file-thumbnails` admin endpoint. No changes to Supabase Storage upload flow (client-side).

**Files**:
- `packages/api/src/routes/playground/generate.ts`
- `packages/api/src/routes/admin/backfill-thumbnails.ts`
- `packages/api/src/middleware/rate-limit.ts` (per-IP and per-user)

**Steps**:
1. Playground: validate `x-playground-key`, per-IP rate limit, caller-supplied API key passthrough.
2. Admin: service-role auth check (constant-time compare), batch processing with Supabase Storage admin client.
3. Rate limiter: sliding-window with Redis (or in-memory fallback for single-instance).

**Rollback**: Remove routes.

**Validation**: Playground key invalid → 401. Exceed 30 req/min → 429. Admin without service key → 403.

---

### P7 — Mobile Cutover (Feature Flag)

**Scope**: New `api-client.ts` adapter in mobile; feature flag `EXPO_PUBLIC_USE_REST_API=1` switches between Supabase bridge and REST client.

**Files**:
- `apps/mobile/lib/api-client.ts` (typed fetch wrapper)
- `apps/mobile/lib/sync/rest-bridge.ts` (implements `Fetcher` + `MutationCaller`)
- `apps/mobile/lib/transcribe-rest.ts`
- `apps/mobile/lib/sync/make-generate-fn-rest.ts`
- `apps/mobile/lib/sync/bridge-factory.ts` (selects adapter based on env)

**Steps**:
1. `api-client.ts`: base URL from `EXPO_PUBLIC_API_URL`, attach Supabase access token, refresh logic, typed request/response.
2. `rest-bridge.ts`: `makePullFetcher` → calls `GET /v1/sync/pull/:table`, `makeMutationCaller` → calls `POST /v1/sync/apply/:entity`.
3. `bridge-factory.ts`: if `EXPO_PUBLIC_USE_REST_API=1` return REST bridge, else Supabase bridge.
4. Update `SyncProvider.tsx` to use factory.
5. Update `transcribe.ts` to delegate to REST or Supabase based on flag.
6. Update `make-generate-fn.ts` to call REST endpoint when flag is set.
7. E2E test both paths (Maestro with flag on and off).

**Rollback**: Set `EXPO_PUBLIC_USE_REST_API=0`, rebuild.

**Validation**: Full sync cycle (pull+push), generate report, transcribe audio — all via REST API. Verify identical behavior with flag off (Supabase path).

---

### P8 — Lock Down PostgREST

**Scope**: After 100% of traffic on REST API, disable PostgREST public access. Keep Supabase Auth + Storage.

**Steps**:
1. Monitor for 1 week: zero RPC calls from mobile (check Supabase logs).
2. Revoke `GRANT EXECUTE` on pull/apply RPCs from `authenticated` role.
3. Optionally restrict PostgREST to internal network only (Supabase dashboard → API settings).
4. Remove edge function deployments (or keep as cold backup).

**Rollback**: Re-grant EXECUTE, redeploy edge functions.

**Validation**: Mobile app with old build gracefully fails with clear error message → forced update.

---

### P9 — Own Auth Issuer (Optional)

**Scope**: Replace Supabase Auth with custom JWT issuer + Twilio Verify for phone OTP.

**Files**:
- `packages/api/src/routes/auth/send-otp.ts`
- `packages/api/src/routes/auth/verify-otp.ts`
- `packages/api/src/routes/auth/refresh.ts`
- `packages/api/src/lib/jwt-issuer.ts`
- `packages/api/src/services/auth/twilio.ts`

**Steps**:
1. Twilio Verify integration (send/check OTP).
2. JWT issuer with RS256 key pair (rotate via Doppler).
3. Refresh token flow (7-day refresh, 1-hour access).
4. Profile creation on first verify (replicate trigger logic).
5. Mobile auth module swap (new `AuthProvider`).
6. Migrate existing users (Supabase `auth.users` → custom `users` table).

**Rollback**: Revert to Supabase Auth.

**Validation**: Full OTP → sign-in → token-refresh → API access cycle.

---

## 7. Mobile Client Changes

### New Files

| File | Purpose |
|------|---------|
| `apps/mobile/lib/api-client.ts` | Typed HTTP client (fetch-based, token injection, error mapping) |
| `apps/mobile/lib/sync/rest-bridge.ts` | `Fetcher` + `MutationCaller` backed by REST |
| `apps/mobile/lib/sync/bridge-factory.ts` | Feature-flag adapter selection |
| `apps/mobile/lib/transcribe-rest.ts` | REST-backed transcription |
| `apps/mobile/lib/sync/make-generate-fn-rest.ts` | REST-backed generation |

### `api-client.ts` Design

```typescript
// Pseudocode
type ApiClient = {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  postForm<T>(path: string, form: FormData): Promise<T>;
};

// Automatically:
// - Reads access_token from Supabase session
// - Adds Authorization: Bearer <token>
// - Retries once on 401 after refreshing token
// - Throws typed ApiError { status, code, message }
```

### Auth Wiring

The mobile app continues using `supabase-js` for auth (sign-in, OTP, session management). The REST API trusts the same JWT. `api-client.ts` reads the token from `backend.auth.getSession()`.

### Feature Flag

```bash
# .env.development
EXPO_PUBLIC_USE_REST_API=0   # default: Supabase path

# .env.staging
EXPO_PUBLIC_USE_REST_API=1   # staging: REST API path
```

Metro inlines the value at bundle time — changing requires a rebuild (documented in AGENTS.md).

---

## 8. Testing Strategy

### Contract Tests (OpenAPI)

- Generate OpenAPI spec from `@hono/zod-openapi` route definitions.
- CI job validates spec is up-to-date (`openapi-diff`).
- Mobile client schemas validated against spec via `zod-to-json-schema` cross-check.

### Unit Tests

| Layer | Framework | What |
|-------|-----------|------|
| Route handlers | Vitest + `hono/testing` | Request/response shape, validation errors, middleware |
| Services | Vitest | Business logic, authz rules, idempotency |
| AI providers | Vitest + mocks | Prompt building, response parsing, error handling |

### Integration Tests (Real Postgres)

- Vitest + `testcontainers` (Postgres container with migrations applied).
- Seed test users via Drizzle (bypass auth for DB-level tests).
- Cover all pull/apply authz paths.
- Verify `client_ops` idempotency.
- Verify soft-delete tombstones appear in pull.

### RLS Test Migration

- Existing `supabase/tests/rls_*.test.ts` continue running against Supabase (defense-in-depth).
- New `packages/api/tests/authz/` mirrors every RLS test as an HTTP-level integration test hitting the API.
- CI runs both suites in parallel.

### Maestro E2E

- Existing Maestro flows run against the REST API path (`EXPO_PUBLIC_USE_REST_API=1`).
- Separate CI matrix entry for Supabase path (regression until P8 lockdown).

### Coverage Target

- `packages/api/`: ≥ 80% line coverage (enforced in CI via `vitest --coverage`).

---

## 9. Observability & Ops

### Logging

- Structured JSON logs (Hono middleware: request-id, method, path, status, duration, userId).
- Log level controlled by `LOG_LEVEL` env var (default: `info`).
- Sensitive fields (Authorization header, request body passwords) redacted.

### Metrics

- Prometheus-compatible `/metrics` endpoint (via `hono-prometheus`).
- Key metrics: `http_requests_total`, `http_request_duration_seconds`, `ai_generation_duration_seconds`, `transcription_duration_seconds`.
- Fly.io exposes built-in Prometheus metrics on `:9091/metrics` per machine; either scrape from Grafana Cloud (free tier) or use Fly's managed Grafana dashboards (free with any paid plan, optional).

### Sentry

- `@sentry/node` with Hono integration.
- Capture unhandled exceptions, LLM parse errors, auth failures.
- Performance tracing on AI and transcription routes.

### Rate Limiting

| Route | Limit | Key | Backend |
|-------|-------|-----|---------|
| `/v1/reports/generate` | 10 req/min | userId | Redis sliding window |
| `/v1/audio/transcribe` | 20 req/min | userId | Redis sliding window |
| `/v1/playground/generate` | 30 req/min | IP | Redis sliding window |
| `/v1/sync/*` | 120 req/min | userId | Redis sliding window |
| Global | 1000 req/min | IP | In-memory token bucket |

### Health Checks

```
GET /v1/health
→ 200 { status: "ok", db: "connected", uptime: 12345 }
→ 503 { status: "degraded", db: "error", message: "..." }
```

Fly.io `[[services.http_checks]]` in `fly.toml` polls this for liveness (10s interval, 3 failures → machine restart). Set `grace_period = "30s"` to allow startup.

### Graceful Shutdown

- `SIGTERM` handler: stop accepting new connections, drain in-flight requests (30s timeout), close DB pool, exit.
- Long-running AI requests get a 120s timeout before forced termination.

---

## 10. Security

### Secrets Management

- **Doppler** for all environments (dev, staging, prod).
- API keys: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MOONSHOT_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `ZAI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`, `REVIEW_ACCESS_KEY`, `SENTRY_DSN`.
- Secrets validated at startup (`envOrThrow` pattern); fail-fast if missing.

### CORS

```typescript
cors({
  origin: [
    'https://playground.harpa.pro',  // Vercel playground
  ],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-Playground-Key', 'X-Request-Id'],
  maxAge: 86400,
})
```

Mobile (React Native fetch) does not send Origin headers — CORS is only relevant for the web playground.

### Idempotency

- All apply mutations keyed on `client_op_id` (UUID, client-generated).
- Duplicate replay returns cached response with `status: "duplicate"`.
- `client_ops` GC: existing cron deletes rows older than 7 days.

### Defense in Depth

1. **JWT verification** (middleware layer)
2. **Application-level authz** (service layer)
3. **RLS policies** remain enabled on Postgres (DB layer)
4. **Input validation** (Zod schemas at route boundary)
5. **SQL injection prevention** (Drizzle parameterized queries — never raw string interpolation)
6. **Rate limiting** (middleware)
7. **Request size limits** (Hono body limit: 50 MB for audio, 1 MB for JSON)

---

## 11. Cost & Ops Impact

### Monthly Cost Estimate (Staging + Prod)

| Item | Current (Supabase) | After Migration | Delta |
|------|-------------------|-----------------|-------|
| Edge function compute | $0 (free tier) → ~$25 at scale | $0 (removed) | −$25 |
| Fly.io API VM (staging) | — | $0 (free tier — 1× shared-cpu-1x 256 MB, auto-stop) | $0 |
| Fly.io API VM (prod) | — | $0–$2/mo (1× shared-cpu-1x 256 MB always-on; first 3 free) | +$0–2 |
| Upstash Redis (rate limit + queue) | — | $0 (free tier: 10k commands/day) → ~$10/mo at scale | +$0–10 |
| Supabase (DB + Auth + Storage) | ~$25/mo | ~$25/mo (unchanged) | $0 |
| **Total delta** | | | **−$15 to +$10/mo** |

Fly.io free allowances cover staging entirely and most of prod for a small user base. Scale up to `shared-cpu-2x` (~$5–8/mo) only when traffic warrants. No fixed monthly minimum.

### Ops Overhead

- **New**: Docker image builds in CI (~2 min), `flyctl deploy` (~45s with rolling restart), Upstash dashboard monitoring.
- **Removed**: `supabase functions deploy` for 4 edge functions, Deno version management, edge function cold starts.
- **Net**: Slight increase in infra complexity, offset by better observability, control, and a real free tier.

---

## 12. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Latency regression (extra network hop: client → Fly → Supabase DB) | Medium | Medium | Deploy Fly app in same region as Supabase project (e.g. `iad`); benchmark P0 |
| 2 | Auth token refresh race during cutover | Low | High | Mobile `api-client.ts` retries once on 401 after token refresh |
| 3 | Authz logic diverges from current RPC behavior | Medium | High | Port RLS tests as integration tests; run both suites in CI |
| 4 | Multipart upload size limits (audio files up to 25 MB) | Low | Medium | Configure Hono `bodyLimit`; Fly proxy default is 50 MB which is sufficient |
| 5 | Fly downtime during deploy | Low | Medium | Fly default rolling strategy with health-check gating; `min_machines_running = 1` in prod |
| 6 | Feature flag state mismatch across app versions | Low | Medium | Server returns `X-Api-Version` header; client logs mismatch |
| 7 | Edge function fixture mode lost during port | Low | Low | Port `USE_FIXTURES` as env-gated mock in API; test in CI |
| 8 | Drizzle schema drift from Supabase migrations | Medium | Medium | CI job: `drizzle-kit pull` and diff against checked-in schema |
| 9 | Cold start on Fly auto-stop (free-tier behavior) | Medium | Low | Prod: `min_machines_running = 1` (always-on, still free for one shared-cpu-1x). Staging: tolerate ~1s cold start |
| 10 | Breaking the playground (Vercel → new API URL) | Low | Low | Update `VITE_SUPABASE_URL` → `VITE_API_URL`; deploy together |

---

## 13. Effort per Phase

| Phase | Description | Effort (person-days) | Dependencies |
|-------|-------------|---------------------|--------------|
| P0 | Scaffold | 2 | — |
| P1 | JWT auth middleware | 1.5 | P0 |
| P2 | Sync pull endpoints | 3 | P1 |
| P3 | Sync apply endpoints | 4 | P1 |
| P4 | Generate report | 3 | P1 |
| P5 | Transcribe audio | 2 | P1 |
| P6 | Playground + Admin + Rate limit | 2 | P4, P5 |
| P7 | Mobile cutover | 3 | P2–P6 |
| P8 | Lock down PostgREST | 0.5 | P7 (1 week soak) |
| P9 | Own auth (optional) | 8 | P8 |
| **Total (P0–P8)** | | **21 person-days** | |
| **Total (P0–P9)** | | **29 person-days** | |

P2 and P3 can be parallelized (−2 days on calendar if two engineers). P4 and P5 can also be parallelized (−2 days).

**Critical path**: P0 → P1 → P2/P3 → P4/P5 → P6 → P7 → P8 ≈ **14 calendar days** (one engineer) or **10 calendar days** (two engineers).

---

## 14. Open Questions

| # | Question | Owner | Deadline |
|---|----------|-------|----------|
| 1 | Fly region — confirm `iad` matches Supabase project region (us-east-1)? | Infra | Before P0 |
| 2 | Do we need WebSocket support for real-time pull (future), or is polling sufficient? | Product | Before P7 |
| 3 | Should the playground move from Vercel to a static asset served by the Fly app (simplify infra)? | Eng | Before P6 |
| 4 | Upstash free tier covers traffic, or upgrade early? | Infra | Before P6 |
| 5 | Do we want to version the API (`/v1/`) from day one, or is it premature? | Arch | Before P0 |
| 6 | Should `token_usage` writes be async (queue) to avoid latency in generate response? | Eng | Before P4 |
| 7 | Client minimum version enforcement — how do we force-update old builds still hitting Supabase RPCs after P8? | Mobile | Before P8 |
| 8 | Is the `backfill-file-thumbnails` endpoint needed long-term, or can it be a one-shot script? | Eng | Before P6 |
| 9 | P9 (own auth): worth the effort given Supabase Auth works? What's the triggering event? | Product | Deferred |
| 10 | Should the `generate-report-playground` endpoint share the same rate-limit Redis or be isolated? | Eng | Before P6 |

