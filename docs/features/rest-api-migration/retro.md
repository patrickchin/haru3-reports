# REST API Migration — Retrospective

> Companion to [plan.md](./plan.md) (the plan) and [test-plan.md](./test-plan.md) (the test plan).
>
> Branch: `feat/rest-api-migration` → `dev`. Status as of 2026-05-06: deployed at `https://harpa-api.fly.dev`, mobile cut over via `EXPO_PUBLIC_USE_REST_API=1` in Doppler[development].

## 1. What was implemented

### 1.1 New service — `packages/api`
- Hono app (Node runtime) packaged for Fly.
- Routes:
  - `POST /v1/sync/:table` — generic mutation endpoint backed by `sync_apply_mutation` RPC.
  - `GET /v1/sync/:table` / pull endpoint.
  - `POST /v1/audio/transcribe` — multipart upload, fans out to OpenAI Whisper.
  - `POST /v1/ai/*` — LLM provider routing.
  - `POST /v1/playground/*`, admin endpoints.
- Auth: Supabase JWT verification, both HS256 (legacy) and **ES256** via JWKS (2026 rotation).
- Rate limit: Upstash Redis store, Fly-provisioned.
- Region: `fra` (Frankfurt) — colocated with Supabase EU.
- Build: Docker, multi-stage, pnpm workspace; `@harpa/report-core` built to CJS for Node runtime.

### 1.2 Mobile cutover
- `EXPO_PUBLIC_USE_REST_API` flag toggles each transport (sync, audio, AI) between Supabase-direct and REST.
- REST adapters in `apps/mobile/lib/sync/*-rest.ts`, `lib/audio/transcribe-rest.ts`, etc.
- Profile screen shows `API: Supabase (direct)` vs `API: REST (harpa-api.fly.dev)` so the bundle's transport is visible at runtime.
- Broken-report screen surfaces `generation_state` / `generation_error` instead of a confusing Zod parse error.

### 1.3 Infra / tooling
- `scripts/sync-fly-secrets.sh` — `doppler secrets download | sed | flyctl secrets import`. Renames `EXPO_PUBLIC_SUPABASE_URL`→`SUPABASE_URL` and `SERVICE_ROLE_KEY`→`SUPABASE_SERVICE_ROLE_KEY` to dodge Doppler's reserved `SUPABASE_` prefix.
- P8 PostgREST lockdown migration template (RLS tightening, not yet applied).
- Integration + contract tests for sync routes.

## 2. Issues encountered (chronological)

### 2.1 Build / packaging
1. **`@harpa/report-core` was ESM-only** → Node Fly runtime couldn't `require()` it. Fixed by emitting CJS (`5653690`, after two false starts `af0ac07`, `9d6e8c6`).
2. **Pnpm `prepare` lifecycle ran in Docker** before `scripts/` was COPYed → `sh scripts/install-git-hooks.sh: No such file or directory` aborted the build (`8c26497`).
3. **`ERR_PNPM_OUTDATED_LOCKFILE`** — `report-core` gained a `typescript` devDep but lockfile wasn't refreshed (`4b17e6d`).

### 2.2 Doppler / secrets
4. **Doppler reserves the `SUPABASE_` prefix** for its native integration. Couldn't store `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` directly. Renamed on sync (`fd42454`).
5. Initial `sync-fly-secrets.sh` had a hand-maintained allow-list that drifted. Replaced with the same pipe shape as `sync-eas.sh` (`6124a51`).

### 2.3 Auth
6. **401 on every authenticated route** post-deploy. Cause: Supabase rotated to **ES256** JWTs in 2026; the API only accepted HS256 with the legacy shared secret. Fixed by adding JWKS-based ES256 verification (`760c4b5`).

### 2.4 Wire-format bugs (the bad ones)
7. **`POST /v1/audio/transcribe` returned 422 "Missing 'file' field"**. The route read `form.get("file")`, but the mobile client and the legacy Supabase Edge Function both upload as `audio`. **The unit test was wrong in the same way the route was wrong** — it built FormData with `fd.append("file", ...)`, so 9/9 tests passed against a contract no real client used (`8ab83a9`).
8. **`POST /v1/sync/:table` mutations failed at the RPC boundary** because the route was passing the JSON-serialized payload string instead of a jsonb object to `sync_apply_mutation` (`c0be3ec`).

### 2.5 Coverage gaps still open
- Sync registry only knows `projects` and `reports`; `sites`, `report_items`, `report_issues` return `not_found, "Unknown sync table"`.
- Storage upload returns RLS violation (`new row violates row-level security policy`) — policy not updated for the REST path's auth context.
- P8 RLS lockdown migration drafted but not applied; tests not written.

## 3. The errors that bit hardest, and why

The build/packaging issues (1–5) were annoying but mechanical — each had a clear error message, each was fixed in one commit. They're the cost of standing up a new Docker target.

The **dangerous** bugs were 6, 7, 8 — all silent or misleading:

| # | Bug | Why tests didn't catch it |
|---|---|---|
| 6 | ES256 JWTs rejected as HS256 | No test posted a *real* Supabase-issued token. Tests signed their own HS256 fixtures. |
| 7 | `audio` vs `file` field name | Test used the same wrong field name as the route. Self-consistent, contract-violating. |
| 8 | jsonb passed as JSON string | RPC boundary mocked in unit tests; integration test didn't exist for this code path. |

Common pattern: **the test and the implementation share an author and a mental model.** When that model is wrong, both agree, and CI is green.

## 4. How to prevent these in future

Ranked cheapest-first:

1. **Shared wire constants.** Field names, route paths, header names live in one module that both server and every client import. Cross-side typo becomes impossible.
   ```ts
   // packages/api-contract/src/audio.ts
   export const AUDIO_FIELD_NAME = "audio";
   ```

2. **Schema-first contracts** with `@hono/zod-openapi`. One Zod schema generates the server validator AND the typed client. Wire drift becomes a TypeScript error.

3. **Import the real client builder in the API test**, not a hand-rolled fixture:
   ```ts
   import { buildTranscribeFormData } from "@harpa/mobile/lib/audio/transcribe-rest";
   const fd = buildTranscribeFormData(blob, "rec.m4a");
   await app.request("/v1/audio/transcribe", { method: "POST", body: fd });
   ```
   This single pattern would have caught bug #7 instantly.

4. **One e2e smoke per critical flow** against a real Fly preview with a real Supabase-issued JWT. Catches #6 (token format) and #8 (RPC boundary) without ceremony.

5. **Review heuristic**: when reading a test, ask *"if the implementation is wrong in the same way the test is wrong, does this test still pass?"* If yes, the test isn't pinning anything.

6. **Boundary tests, not unit tests, for boundaries**. The sync RPC payload bug (#8) lived at the database boundary. Mocking the RPC in unit tests was worse than no test — it gave false confidence. Use Testcontainers / a real Supabase test project for these.

## 5. If we were starting over

The order of work would change. We did:

```
1. Build the API service
2. Write tests against the API service
3. Cut mobile over
4. Deploy
5. Discover contract bugs in production
```

We should have done:

```
1. Define the wire contract first (Zod schemas, shared constants, OpenAPI spec)
2. Generate the typed mobile client from the spec
3. Write contract tests that exercise:
   - the real mobile client builder
   - a real Supabase-issued JWT
   - a real Postgres (Testcontainers) for RPC boundary
4. Build the API service to satisfy the contract
5. Deploy behind the EXPO_PUBLIC_USE_REST_API flag
6. Smoke test on a Fly preview before flipping any user
```

Concrete deltas:

- **Contract package first.** `packages/api-contract` with Zod schemas + constants + OpenAPI doc. Owned by neither client nor server; both depend on it.
- **No bespoke FormData / fetch in mobile.** Generated client only. Field names can't drift.
- **JWT fixtures come from a real Supabase test project**, not a local HS256 signer. Catches algorithm/key-rotation bugs.
- **Sync RPC has a Testcontainers integration test** from day 1 — every shape change runs against real Postgres.
- **Profile-screen API indicator landed before cutover**, not after. We had no way to confirm a build was on REST until we shipped that, and lost time guessing.
- **Doppler secret naming convention documented up front** (the `SUPABASE_` reserved prefix). Would have saved the rename round-trip.
- **Docker build verified locally** (`docker build -f packages/api/Dockerfile .`) before the first `flyctl deploy`. All three build failures would have surfaced in 60 seconds locally.

## 6. Open follow-ups

- [ ] Register `sites`, `report_items`, `report_issues` in sync route registry.
- [ ] Fix storage RLS policy for REST upload path.
- [ ] Apply P8 PostgREST lockdown migration + write tests.
- [ ] Extract `packages/api-contract` and refactor existing routes/clients/tests to use it.
- [ ] Add Testcontainers integration test for `sync_apply_mutation` RPC.
- [ ] Add an e2e smoke (Maestro or curl-based) that exercises voice-note + sync against `harpa-api.fly.dev` with a real JWT.
- [ ] Open PR `feat/rest-api-migration` → `dev`.
