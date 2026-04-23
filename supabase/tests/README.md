# Supabase RLS integration tests

These tests exercise **real PostgreSQL policies** against the linked Supabase
project configured in `apps/mobile/.env.local`. They are not unit tests — they
hit the network and mutate the remote dev database — but they are the only
layer where RLS actually runs. Mocked Supabase clients cannot catch RLS bugs.

## Why a separate layer

| Layer | Catches | Files |
|---|---|---|
| Unit (vitest, mocked) | client logic, validation, UI state | `apps/**/*.test.{ts,tsx}` |
| **RLS integration** (this dir) | policies, triggers, constraints, SQL fns | `supabase/tests/*.test.ts` |
| Maestro E2E | full user journey incl. UI | `apps/mobile/.maestro/` |

The project RLS regression (42501 on `INSERT ... RETURNING id`) was invisible
to the unit suite because the bug lived in PostgreSQL, not TypeScript. These
tests reproduce it in a few hundred ms without a simulator.

## Running

```bash
pnpm --filter mobile exec vitest run ../../supabase/tests
```

Uses the seeded demo users (`mike@example.com` / `sarah@example.com`, both
password `test1234`) and anon key from `apps/mobile/.env.local`. Each suite
cleans up the rows it creates in `afterAll`.

## Coverage

| File | Table / surface |
|---|---|
| `rls_projects.test.ts` | owner CRUD, stranger denial, soft-delete, impersonation |
| `rls_reports.test.ts` | owner insert (+RETURNING), stranger denial, role-based insert, owner-only delete |
| `rls_project_members.test.ts` | admin-add/remove, viewer cannot add, `get_project_team` RPC |
| `rls_profiles.test.ts` | own-only access, phone isolation, `lookup_profile_id_by_phone` |
