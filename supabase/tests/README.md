# Supabase RLS integration tests

These tests exercise **real PostgreSQL policies** — RLS, triggers, constraints,
SQL functions. They are not unit tests (they sign in over HTTP and mutate
data), but they are the only layer where RLS actually runs. Mocked Supabase
clients cannot catch RLS bugs.

## Where the suite runs

The same suite targets either a **local `supabase start` stack** (default) or
the **hosted dev project**. URL + anon key are resolved by `helpers.ts` in
this order:

1. `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars (local stack convention)
2. `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars (CI / hosted)
3. `apps/mobile/.env.local` (local dev convenience)

| Layer | Catches | Files |
|---|---|---|
| Unit (vitest, mocked) | client logic, validation, UI state | `apps/**/*.test.{ts,tsx}` |
| **RLS integration** (this dir) | policies, triggers, constraints, SQL fns | `supabase/tests/*.test.ts` |
| Maestro E2E | full user journey incl. UI | `apps/mobile/.maestro/` |

## Running locally

**Local stack (recommended for iteration — isolated, fast, no shared state):**

```bash
pnpm test:rls:local                # supabase start + db reset + run suite
SKIP_RESET=1 pnpm test:rls:local   # keep current local data
```

Requires the Supabase CLI (`brew install supabase/tap/supabase`) and Docker.
The stack is reset (`supabase db reset`) so every run re-applies all
migrations + `seed.sql` and starts from a known state.

**Hosted dev project (drift / pre-deploy smoke):**

```bash
pnpm test:rls:hosted
```

Reads URL + anon key from env vars or `apps/mobile/.env.local`. Signs in as
the seeded users `mike@example.com` / `sarah@example.com` (password
`test1234`). Each suite cleans up the rows it creates in `afterAll` — but
because the dev DB is shared, parallel runs can still interfere.

## CI

`.github/workflows/rls-tests.yml` runs the suite in two modes:

- **local** — every PR + push to `main`/`dev` that touches `supabase/**`.
  Spins up `supabase start`, captures URL+key from `supabase status -o env`,
  runs the suite, then `supabase stop`.
- **hosted** — nightly (`0 19 * * *`) and manual `workflow_dispatch`. Uses
  `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` repo secrets.
  Catches drift between migrations and the deployed schema.

The mobile unit suite (`mobile-tests.yml`) no longer needs Supabase secrets —
it only runs the mocked tests under `apps/mobile/lib/`.

## Coverage

| File | Table / surface |
|---|---|
| `rls_projects.test.ts` | owner CRUD, stranger denial, soft-delete, impersonation |
| `rls_reports.test.ts` | owner insert (+RETURNING), stranger denial, role-based insert, owner-only delete |
| `rls_soft_delete.test.ts` | direct `update({deleted_at})` rejection (regression pin) + SECURITY DEFINER RPCs (`soft_delete_project`, `soft_delete_report`) |
| `rls_project_members.test.ts` | admin-add/remove, viewer cannot add, `get_project_team` RPC |
| `rls_profiles.test.ts` | own-only access, phone isolation, `lookup_profile_id_by_phone` |
