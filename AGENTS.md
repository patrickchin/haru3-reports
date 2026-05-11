# Project: harpa-pro

**Stack:** pnpm + turbo monorepo. React Native (Expo) mobile app at
`apps/mobile-v3`, docs site at `apps/docs`, Hono REST API at
`packages/api`, shared contract at `packages/api-contract`, shared
package at `packages/report-core`. Supabase for auth, Postgres + RLS,
migrations in `supabase/migrations/`. Vitest for unit tests, Maestro
for mobile E2E.

# Recurring bugs log

Before debugging a flaky test, "intermittent" UI regression, or
anything that smells familiar, read [`docs/bugs/README.md`](docs/bugs/README.md).
It catalogues bugs that have bitten us more than once and the
recurring patterns (R1–R9) that produce them. When you ship a fix
for a bug that recurred, that almost-recurred, or that only got
caught by manual QA / E2E despite green tests, add an entry to
the same file in the same PR. Update the R-numbered patterns
when you spot a new shape.

# Subagents

Use specialized subagents proactively rather than doing everything inline:

- `architect` — design large features and refactors before coding
- `database-reviewer` — Postgres/Supabase/RLS schema and query work
- `tdd-guide` — write tests first, enforce 80%+ coverage
- `code-reviewer` — review immediately after writing/modifying code
- `security-reviewer` — anything touching auth, RLS, user input, or sensitive data
- `e2e-runner` — Maestro/Playwright test work
- `build-error-resolver` — TypeScript/turbo build failures
- `doc-updater` — keeping docs in sync with code

# Skills

Project-specific skills auto-load from `.opencode/skills/`: api-design,
backend-patterns, database-migrations, e2e-testing, frontend-patterns,
postgres-patterns. Global skills also auto-load: coding-standards,
tdd-workflow, verification-loop, ai-regression-testing,
continuous-learning-v2, strategic-compact, skill-stocktake. The model
auto-invokes them based on context — no need to specify.

# Deployment / EAS / Supabase / Vercel

Before any deploy, build, or OTA update task, read `docs/02-deployment.md`.

# Merge Workflow

Before merging branches, read `docs/07-merge-workflow.md`.

# Database / RLS

Before changing schema, migrations, or RLS policies, read
`supabase/tests/README.md`. Migration filenames use the timestamp pattern
`YYYYMMDDHHmm_description.sql`.

**RLS test rule (mandatory).** Any change that affects how the client
reads, writes, or deletes a Postgres table — including new mobile code
paths that hit a different table/column, switching DELETE→UPDATE
(soft-delete), introducing new RPCs, or relaxing/tightening a policy —
**must** ship with a matching test in `supabase/tests/rls_*.test.ts`
that hits a real database. Mocked client tests do not exercise RLS and
will silently pass on broken policies. If the change adds a SECURITY
DEFINER RPC, also add a "direct client UPDATE/DELETE is rejected"
regression assertion so the bypass is intentional, not accidental.

# Tests

Before adding or changing tests, read `docs/09-testing.md` for the full
strategy (layers, Maestro E2E setup, JS-only rebundle trick, authoring rules).
On Windows, also read the "Windows: Android release build pitfalls"
section in the same file before running `expo run:android` —
`node-linker=hoisted`, Gradle/CMake cache wipes, Notifee maven repo,
`ANDROID_SERIAL`, and shell-exported `EXPO_PUBLIC_*` are all required.

- All tests:        `pnpm test`
- Mobile (Vitest):  `pnpm test:mobile`
- API (Vitest):     `pnpm test:api`
- RLS:              see `supabase/tests/README.md`
- Maestro E2E:      `cd apps/mobile-v3 && maestro test .maestro/`

# Mobile dev / fixture mode

- Do not use the system default `Alert.alert` for in-app dialogs or pickers;
  use `AppDialogSheet` (or another themed UI primitive) so prompts match the
  rest of the app's styling.
- `pnpm ios` / `pnpm ios:mock` / `pnpm ios:mock:release` (run from repo root).
  `:mock` builds inline `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true`, which only
  stubs the iOS-simulator audio recorder (writes a tiny placeholder file in
  place of mic input). The transcription and LLM calls go through the Hono
  API; in fixture mode (`USE_FIXTURES=true`) the API returns canned responses.
- `EXPO_PUBLIC_*` vars are inlined by Metro at bundle time — changing them
  requires a rebuild, not a JS reload.

# Commits

Use Conventional Commits (`feat(scope): …`, `fix(scope): …`, etc.).
Default branch is `dev`. Never push to `main` directly.

# Workspace dependencies

Add packages with `pnpm --filter <workspace> add <pkg>`, not from the repo root.

# AI providers / report schema

For changes to AI provider routing or report schema, read
`docs/03-ai-providers.md` and `docs/04-report-schema.md`.

# Large features

Before implementing a large feature, use the `architect` subagent to design it
first.

# Documentation

Whenever code changes affect behaviour, schema, deployment, or workflow,
update the relevant doc in `docs/` (and any referenced files) in the same
commit. Keep `docs/` in sync with the code — outdated docs are worse than no
docs.
