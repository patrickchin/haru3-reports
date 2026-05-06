# REST API Migration — Detailed Test Plan

Companion to [rest-api-migration.md](./rest-api-migration.md). This document
specifies **what to test, how to test it, and which gates must pass** before
each migration phase ships. It is the implementation contract for the
testing strategy summarized in section 8 of the main plan.

---

## 1. Goals & Non-Goals

### Goals

- Prove behavioral parity between the new REST API and the existing
  Supabase RPCs / Edge Functions before any production traffic is cut over.
- Catch authorization regressions before they leak data — every RLS test
  has a matching API-layer test.
- Block any phase that fails its validation gate.
- Keep the existing `supabase/tests/` and `apps/mobile` test suites green
  throughout the migration (no regressions on the legacy path).

### Non-Goals

- Replacing existing test infrastructure (Vitest, Deno test, Maestro).
- Load testing beyond a smoke benchmark in P0.
- Chaos engineering / fault injection (deferred post-migration).

---

## 2. Test Pyramid

```
           ┌────────────────────┐
           │  Maestro E2E       │  ~10 flows × 2 backends (Supabase + REST)
           │  (mobile + API)    │
           ├────────────────────┤
           │  Contract / OpenAPI│  Schema diff + client validation
           ├────────────────────┤
           │  Integration       │  Vitest + Testcontainers (real Postgres)
           │  (API + DB)        │  Authz parity vs supabase/tests/rls_*
           ├────────────────────┤
           │  Unit              │  Route handlers, services, AI parsers
           │  (Vitest)          │
           └────────────────────┘
```

| Layer | Count target | Runs in | Wall time budget |
|-------|--------------|---------|------------------|
| Unit | 200+ | Every PR | < 30 s |
| Integration | 60+ | Every PR | < 3 min |
| Contract | 1 spec validator + per-route | Every PR | < 30 s |
| Maestro E2E | 10 flows × 2 backends | Nightly + pre-release | < 20 min |

---

## 3. Test Fixtures & Seed Data

### Shared fixtures

A new package `packages/api-test-fixtures/` exports deterministic seed
data shared by integration tests and the playground:

```ts
// packages/api-test-fixtures/src/index.ts
export const USERS = {
  mike:   { id: '00000000-0000-0000-0000-000000000001', phone: '+15555550101' },
  sarah:  { id: '00000000-0000-0000-0000-000000000002', phone: '+15555550102' },
  outsider: { id: '00000000-0000-0000-0000-000000000099', phone: '+15555559999' },
} as const;

export const PROJECTS = {
  mikeAlpha: { id: 'p-alpha', owner_id: USERS.mike.id, name: 'Alpha Site' },
  sharedBeta: { id: 'p-beta', owner_id: USERS.mike.id, name: 'Beta Site' },
};

export const MEMBERSHIPS = [
  { project_id: PROJECTS.sharedBeta.id, user_id: USERS.sarah.id, role: 'editor' },
];
```

### Seeding strategy

- **Unit tests**: import fixtures directly, never touch a DB.
- **Integration tests**: `seed(db, { users, projects, memberships, reports })`
  helper resets and re-applies fixtures per test (`beforeEach`).
- **Maestro E2E**: pre-seeded via `supabase/seed.sql` (already exists),
  augmented with a `supabase/seed.api-test.sql` for migration-only data.

### Test JWT minting

Production verifies JWTs against Supabase JWKS. Tests use a **local HS256
signer** with a shared dev secret bypass:

```ts
// packages/api/tests/helpers/auth.ts
export function mintTestJwt(userId: string, exp = '1h') {
  return jwt.sign({ sub: userId }, env.TEST_JWT_SECRET, {
    algorithm: 'HS256', expiresIn: exp, issuer: 'test',
  });
}
```

The auth middleware accepts HS256 only when `NODE_ENV === 'test'` AND
`TEST_JWT_SECRET` is set; otherwise rejects. Production path verifies
RS256 via JWKS.

---

## 4. Unit Tests

### 4.1 Route handler tests (`packages/api/tests/routes/*.test.ts`)

Per route, cover:

| Case | Assertion |
|------|-----------|
| Happy path | 200 + Zod-valid response body |
| Missing auth | 401 `{ error: 'unauthenticated' }` |
| Expired JWT | 401 `{ error: 'token_expired' }` |
| Invalid input | 422 with field-level errors from Zod |
| Body too large | 413 |
| Unknown route | 404 |
| Idempotent replay (writes only) | Same response, single side effect |

Example for `POST /v1/sync/report/apply`:

```ts
describe('POST /v1/sync/report/apply', () => {
  it('applies a new report mutation', async () => {
    const res = await app.request('/v1/sync/report/apply', {
      method: 'POST',
      headers: authHeaders(USERS.mike.id),
      body: JSON.stringify({ payload: validReportMutation() }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: 'applied',
      server_version: expect.any(String),
      row: expect.objectContaining({ id: expect.any(String) }),
    });
  });

  it('returns duplicate on replay with same client_op_id', async () => { ... });
  it('returns conflict when server_version is stale', async () => { ... });
  it('returns 403 when user is not project member', async () => { ... });
  it('rejects payloads with extra unknown fields (.strict())', async () => { ... });
});
```

### 4.2 Middleware tests

| Middleware | Cases |
|-----------|-------|
| `auth` | Valid JWT → user attached; missing → 401; bad signature → 401; expired → 401; wrong issuer → 401 |
| `request-id` | Generates UUID; respects incoming `X-Request-Id` |
| `rate-limit` | Allows under limit; 429 over limit; per-user vs per-IP keys; `Retry-After` header |
| `error-handler` | Zod error → 422; thrown `HTTPException` → mapped status; unknown → 500 + Sentry |
| `cors` | Mobile (no Origin) → no headers; playground origin → allowed; bad origin → blocked |

### 4.3 Service-layer tests

| Service | Coverage |
|---------|----------|
| `applyReportMutation` | New / update / soft-delete / conflict / idempotency / authz |
| `pullProjectsSince` | Cursor pagination; tombstones included; only authorized rows |
| `generateReport` | Provider routing, prompt building, parse errors, fixture mode |
| `transcribeAudio` | Provider selection, multipart parsing, format validation |
| `rateLimit` | Sliding window math; clock skew; key normalization |

### 4.4 AI provider tests

Each provider (`openai`, `anthropic`, `google`, `moonshot`, `deepseek`,
`zai`, `groq`) gets fixture-based tests:

```ts
describe('openai provider', () => {
  it('builds correct request body', () => { ... });
  it('parses successful response', () => {
    const fixture = readFixture('openai/success.json');
    const result = parseResponse(fixture);
    expect(result.report).toMatchSchema(GeneratedSiteReportSchema);
  });
  it('handles rate-limit error → throws ProviderRateLimitError', () => { ... });
  it('handles malformed JSON → throws ProviderParseError', () => { ... });
});
```

Fixtures live in `packages/api/tests/fixtures/providers/<name>/`.

---

## 5. Integration Tests (Real Postgres)

### 5.1 Setup

- `vitest.integration.config.ts` with `testTimeout: 30_000`.
- Per-suite `beforeAll`: spin up Testcontainer Postgres 17, apply
  `supabase/migrations/*.sql` in order.
- Per-test `beforeEach`: `TRUNCATE` user-data tables, re-seed fixtures.
- Connect via `postgres` driver with the same `DATABASE_URL` shape as prod.

### 5.2 Sync pull parity tests (P2 gate)

For each table (`projects`, `reports`, `report_notes`, `file_metadata`,
`project_members`):

| Test | Description |
|------|-------------|
| `returns_rows_owned_by_user` | Mike sees Mike's rows |
| `excludes_rows_of_other_users` | Mike does NOT see outsider's rows |
| `includes_shared_via_membership` | Sarah sees `sharedBeta` (member) but not `mikeAlpha` |
| `respects_cursor` | `?cursor=<ts>` returns only rows with `server_updated_at > ts` |
| `respects_limit` | `?limit=10` returns ≤ 10 rows |
| `includes_tombstones` | Soft-deleted rows appear with `deleted_at` set |
| `parity_with_supabase_rpc` | Same fixtures → same row IDs as `pull_<table>_since` RPC |

The **parity** test is critical: it runs the same query through both
`supabase.rpc('pull_<table>_since', ...)` and `GET /v1/sync/<table>` and
asserts identical row sets (ignoring physical ordering, comparing by ID
sets and content hashes).

### 5.3 Sync apply parity tests (P3 gate)

Per entity (`project`, `report`, `report_note`, `file_metadata`):

| Case | Expected |
|------|----------|
| Insert new row | `{ status: 'applied' }`, row in DB, `server_version` returned |
| Update with current version | `{ status: 'applied' }`, row updated |
| Update with stale version | `{ status: 'conflict' }`, server snapshot returned, no DB change |
| Replay same `client_op_id` | `{ status: 'duplicate' }`, no double-write |
| Soft delete | `{ status: 'applied' }`, `deleted_at` set, row hidden from non-tombstone queries |
| Foreign user | `{ status: 'forbidden' }`, no DB change |
| Invalid foreign key | 422 |
| Concurrent identical mutation (race) | Exactly one applied, other duplicate |

### 5.4 Authorization parity (P2/P3 gate — most important)

Every test in `supabase/tests/rls_*.test.ts` is mirrored in
`packages/api/tests/authz/`. Generation strategy:

```ts
// for each existing RLS test
test(`API mirrors RLS: ${rlsTestName}`, async () => {
  const supabaseResult = await runViaSupabaseClient(...);
  const apiResult = await runViaApiHttp(...);
  expect(apiResult.dataIds).toEqual(supabaseResult.dataIds);
  expect(apiResult.status).toBe(supabaseResult.status);
});
```

A CI job **fails the PR** if `supabase/tests/rls_*.test.ts` count >
`packages/api/tests/authz/*.test.ts` count (i.e. you added an RLS test
without porting it).

### 5.5 AI generation tests (P4 gate)

| Scenario | Backend | Assertion |
|----------|---------|-----------|
| Fixture mode (USE_FIXTURES=1) | Mocked provider | Returns canned report; no network |
| Real provider (CI smoke) | Moonshot | 200 + valid `GeneratedSiteReport` schema |
| Provider 5xx | Mock | Surfaces as 502 from API |
| Provider rate-limit | Mock | 429 with `Retry-After` |
| Malformed LLM response | Mock | 502 + Sentry breadcrumb |
| Token usage logged | Real or mock | `token_usage` row inserted |
| Authz: project member can generate | Real DB | 200 |
| Authz: non-member 403 | Real DB | 403 |

### 5.6 Transcription tests (P5 gate)

| Scenario | Assertion |
|----------|-----------|
| Multipart upload .m4a | 200 + `{ transcript: string }` |
| File too large (>25 MB) | 413 |
| Wrong MIME type | 422 |
| Provider failure | 502 |
| Fixture mode | Returns mock transcript |
| Authz | Caller must own/share the report |

---

## 6. Contract Tests (OpenAPI)

### 6.1 Spec generation & freshness

```yaml
# .github/workflows/api-ci.yml (excerpt)
- run: pnpm --filter api openapi:generate > /tmp/openapi.json
- run: diff /tmp/openapi.json packages/api/openapi.json || \
       (echo "OpenAPI spec out of date. Run pnpm --filter api openapi:generate" && exit 1)
```

### 6.2 Spec validation

- `@redocly/cli lint packages/api/openapi.json` → no errors.
- `openapi-diff` against the previous main commit → breaking changes
  flagged as PR comment.

### 6.3 Client-server alignment

- Mobile `lib/api-client.ts` types are generated from the spec via
  `openapi-typescript`.
- A test asserts every spec path has a corresponding generated method;
  every generated method has a corresponding handler.

---

## 7. Mobile Client Tests

### 7.1 `api-client.ts` unit tests

| Case | Assertion |
|------|-----------|
| Adds Authorization header from session | Header present |
| Refreshes token on 401, retries once | Second call has new token |
| Surfaces 4xx as typed errors | `ApiClientError` with status + body |
| Network error → retry policy | Up to 3 retries with backoff for idempotent reads |
| Cancellation via AbortSignal | Throws AbortError |

### 7.2 Adapter swap tests

`apps/mobile/lib/sync/supabase-bridge.test.ts` already exists. Add a
sibling `rest-bridge.test.ts` covering the new `Fetcher` and
`MutationCaller` implementations with identical test cases — same
inputs, same outputs.

### 7.3 Feature flag tests

| Case | Expected |
|------|----------|
| `EXPO_PUBLIC_USE_REST_API` unset | Sync uses Supabase bridge |
| Flag = `1` | Sync uses REST bridge |
| Flag toggles mid-session | Existing in-flight requests complete on old bridge; new requests use new bridge |

---

## 8. Maestro E2E Tests

### 8.1 Backend matrix

```yaml
# apps/mobile/.maestro/config.yaml
matrix:
  backend: [supabase, rest]
```

CI matrix runs every flow against both backends until P8 (PostgREST
lockdown), after which the `supabase` axis is removed.

### 8.2 Critical flows (must pass on both backends before P7 cutover)

| Flow | File | Validates |
|------|------|-----------|
| Login via OTP | `signup-or-login-mike.yaml` | Auth, JWT, profile creation |
| Create project | `create-project.yaml` | Sync apply + RLS |
| Record voice note | `record-voice-note.yaml` | Audio upload, transcribe, sync |
| Generate report | `generate-report.yaml` | AI route, token usage |
| Edit report and re-sync | `edit-report.yaml` | Conflict handling, push |
| Add teammate to project | `add-teammate.yaml` | `lookup_profile_id_by_phone`, membership |
| Soft-delete report | `delete-report.yaml` | Tombstone propagation |
| Offline queue + reconnect | `offline-sync.yaml` | Outbox flush, idempotency |
| Logout / re-login | `logout-relogin.yaml` | Session clear, AsyncStorage |
| File upload + thumbnail | `file-upload.yaml` | Storage, file_metadata, RLS cascade |

### 8.3 Local dev script

```bash
# apps/mobile/scripts/maestro-both.sh
EXPO_PUBLIC_USE_REST_API=0 pnpm ios:mock && maestro test .maestro/
EXPO_PUBLIC_USE_REST_API=1 pnpm ios:mock && maestro test .maestro/
```

Note: each toggle requires a rebuild (Metro inlines `EXPO_PUBLIC_*`).

---

## 9. Performance / Smoke Tests

Not full load tests — sanity checks per phase.

### 9.1 P0 latency baseline

`packages/api/tests/perf/baseline.ts` runs after Fly.io deploy in CI:

| Endpoint | P50 target | P95 target |
|----------|-----------|-----------|
| `GET /v1/health` | < 50 ms | < 200 ms |
| `GET /v1/sync/projects` (10 rows) | < 100 ms | < 400 ms |
| `POST /v1/sync/report/apply` (insert) | < 150 ms | < 600 ms |
| `POST /v1/reports/generate` (Moonshot fixture) | < 50 ms | < 200 ms |

If P95 of a route exceeds 2× the equivalent Supabase RPC measured
pre-migration → block phase.

### 9.2 Cold-start measurement

After `flyctl machine stop && flyctl machine start`, first-request
latency must be < 2 s. Documented; not a hard gate (only matters for
staging where `min_machines_running = 0`).

---

## 10. Security Tests

| Test | Tool / Method |
|------|--------------|
| No secrets in logs | `grep -r 'sk-\|eyJhb' packages/api/dist` post-build → must be empty |
| JWT verification rejects HS256 in prod | Integration test with `NODE_ENV=production` |
| SQL injection (Drizzle parameterization) | Manual review + `sqlmap` smoke against `?cursor=` |
| CORS rejects unknown origins | Integration test |
| Rate limit resets correctly | Integration test (advance fake clock) |
| Service-role key never reaches client | Static check: `SUPABASE_SERVICE_ROLE_KEY` must not appear in `apps/mobile` build output |
| Idempotency keys prevent double-spend | Concurrent replay test |
| Drizzle migrations cannot drop columns silently | `drizzle-kit check` + manual review gate |
| Dependency CVEs | `pnpm audit --prod` blocks high/critical |
| OWASP API Top 10 walkthrough | Manual checklist before P7 cutover |

---

## 11. Test Environments

| Env | Purpose | DB | Auth | AI |
|-----|---------|----|----|----|
| `unit` | Per-PR fast tests | None | Mocked | Mocked |
| `integration` | Per-PR DB tests | Testcontainers Postgres | Local HS256 | Mocked |
| `staging` | Deployed Fly.io app pointed at Supabase staging branch | Supabase staging | Real Supabase Auth | Real keys (low quota) |
| `prod` | Production after P7 cutover | Supabase prod | Real | Real |

`USE_FIXTURES=true` in staging mocks AI/transcription responses
(matches existing edge function behavior). 5s default delay
(`FIXTURES_DELAY_MS`) for realistic UX.

---

## 12. Phase Validation Gates

Each phase must pass these before merging to `dev`:

| Phase | Gate |
|-------|------|
| **P0** | `GET /v1/health` returns 200 from Fly; CI green; `pnpm test` and `pnpm test:mobile` still pass |
| **P1** | Auth middleware unit tests 100% coverage; integration test verifies a real Supabase JWT |
| **P2** | All sync pull parity tests pass for all 5 tables; authz mirror tests cover every existing RLS test |
| **P3** | All sync apply parity tests pass for all 4 entities; idempotency test green; conflict handling identical to RPC |
| **P4** | `generate-report` produces byte-identical reports vs edge function for 20 fixture inputs (deterministic with `temperature: 0`); fixture mode works |
| **P5** | `transcribe-audio` produces same transcript for 10 audio fixtures; multipart limits enforced |
| **P6** | Rate limits enforced; admin endpoints gated; thumbnail backfill produces identical output to existing function |
| **P7** | Maestro E2E green on both backends for all 10 flows; mobile A/B canary (5%) error rate < 0.1% over 24 h |
| **P8** | PostgREST lockdown: integration test confirms direct table access from anon key returns 401; mobile still works (only via API) |
| **P9** | (optional) Auth migration: OTP delivery success rate ≥ existing baseline; session refresh works |

---

## 13. CI Pipeline

```yaml
# .github/workflows/api-ci.yml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api lint
      - run: pnpm --filter api typecheck
      - run: pnpm --filter api test:unit

  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: postgres }
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
        ports: [5432:5432]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: supabase db push --db-url postgres://postgres:postgres@localhost:5432/postgres
      - run: pnpm --filter api test:integration
      - run: pnpm --filter api test:authz-parity

  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm --filter api openapi:generate > /tmp/spec.json
      - run: diff /tmp/spec.json packages/api/openapi.json
      - run: pnpm dlx @redocly/cli lint packages/api/openapi.json

  rls-still-green:
    # legacy path must continue to work until P8
    runs-on: ubuntu-latest
    steps:
      - run: cd supabase/tests && deno test -A

  e2e-matrix:
    if: github.ref == 'refs/heads/dev' || contains(github.event.pull_request.labels.*.name, 'e2e')
    strategy:
      matrix:
        backend: [supabase, rest]
    steps:
      - run: cd apps/mobile && EXPO_PUBLIC_USE_REST_API=${{ matrix.backend == 'rest' && '1' || '0' }} maestro test .maestro/
```

Required checks on `dev` branch: `unit`, `integration`, `contract`,
`rls-still-green`. `e2e-matrix` runs nightly and on labeled PRs.

---

## 14. Rollback Validation

Each phase's rollback must itself be tested:

| Phase | Rollback test |
|-------|---------------|
| P2 | Set `EXPO_PUBLIC_USE_REST_API=0`, rebuild → sync still works via Supabase |
| P3 | Same as P2 |
| P4 | Mobile reverts to `backend.functions.invoke('generate-report', ...)` — verified by toggling per-feature flag `EXPO_PUBLIC_REST_GENERATE` |
| P7 | Feature flag flip rolls 100% back to Supabase within one OTA update (≤ 5 min) |
| P8 | Re-enable PostgREST RLS policies via Supabase dashboard; integration test confirms |

A **rollback drill** runs in staging weekly during P4–P8: deploy, flip
flag forward, verify, flip flag back, verify.

---

## 15. Test Data Cleanup

- Integration tests use `TRUNCATE ... CASCADE` between tests; no
  cross-test bleed.
- Maestro E2E uses dedicated test users (Mike, Sarah) seeded via
  `supabase/seed.sql`; never against real users.
- Staging Supabase has a nightly job that purges test users older than
  7 days (already exists for current Maestro setup).

---

## 16. Open Test Questions

| # | Question | Owner | When |
|---|----------|-------|------|
| 1 | Should we run `pgTAP` tests (in-DB) for `apply_*` RPCs as a third parity layer, or trust HTTP integration tests? | Eng | Before P3 |
| 2 | Acceptable parity-test runtime ceiling — do we cap at 5 min or shard? | Infra | Before P2 |
| 3 | Do we want mutation testing (Stryker) on the API package, or skip for v1? | Eng | Post-P7 |
| 4 | For LLM determinism tests, do we pin a specific Moonshot model snapshot, or accept token-set similarity within a tolerance? | Eng | Before P4 |
| 5 | Should Maestro E2E gate PR merge, or only nightly? (Currently labeled-PR opt-in.) | Eng | Before P7 |

---

## 17. Effort Estimate

| Block | Effort (person-days) |
|-------|---------------------|
| Test fixtures + seed helpers + JWT minter | 2 |
| Unit tests for routes/middleware/services (per phase) | included in each phase |
| Integration test harness (Testcontainers, migrations apply) | 2 |
| Sync pull/apply parity suite (5 tables × 4 entities) | 4 |
| RLS → API authz mirror generator | 3 |
| AI provider fixture suite | 2 |
| Maestro E2E backend matrix wiring | 1 |
| Contract test pipeline (OpenAPI generation, diff) | 1 |
| Performance baseline harness | 1 |
| Rollback drill automation | 1 |
| **Total dedicated test work** | **~17 person-days** (parallelizable with feature work) |

---

## 18. Acceptance Checklist (Pre-P7 Cutover)

Mobile cannot cut over until **all** of these are checked:

- [ ] Unit coverage ≥ 80% for `packages/api/`
- [ ] All sync pull/apply parity tests green
- [ ] Authz mirror count ≥ RLS test count
- [ ] OpenAPI spec linted, no breaking changes vs last release
- [ ] Maestro E2E green on **both** backends for all 10 critical flows
- [ ] Performance baseline within 2× of Supabase RPC latencies
- [ ] Security checklist (section 10) all green
- [ ] Rollback drill executed in staging within last 7 days
- [ ] Sentry error rate on staging API < 0.5% over a 7-day window
- [ ] Docs updated: `docs/01-architecture.md`, `docs/09-testing.md`,
      `AGENTS.md`

---

## 19. Post-Cutover Notes

See [archive/rest-api-migration-retro.md](./archive/rest-api-migration-retro.md) for the
post-implementation retrospective — including the contract bugs that slipped
through this test plan (the `audio` vs `file` field-name drift and the
jsonb-as-JSON-string RPC bug) and the testing gaps that allowed them. Future
revisions of this plan should incorporate the contract-first / shared-wire-
constants recommendations from §4 and §5 of the retro.
