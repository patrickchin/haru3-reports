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

- All tests:        `pnpm test`
- Mobile (Vitest):  `pnpm test:mobile`
- Edge functions:   `cd supabase/functions/<name> && deno test -A`
- RLS:              see `supabase/tests/README.md`
- Maestro E2E:      `cd apps/mobile && maestro test .maestro/`

# Mobile dev / fixture mode

- Do not use the system default `Alert.alert` for in-app dialogs or pickers;
  use `AppDialogSheet` (or another themed UI primitive) so prompts match the
  rest of the app's styling.
- `pnpm ios` / `pnpm ios:mock` / `pnpm ios:mock:release` (run from repo root).
  `:mock` builds inline `EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true`, which only
  stubs the iOS-simulator audio recorder (writes a tiny placeholder file in
  place of mic input). The transcribe-audio edge call still goes through
  auth + network normally; the transcript itself is mocked server-side via
  `USE_FIXTURES=true` (same flag as the LLM mock).
- `EXPO_PUBLIC_*` vars are inlined by Metro at bundle time \u2014 changing them
  requires a rebuild, not a JS reload.
- Fixture-mode edge functions (LLM + transcription) default to a 5s delay
  via `FIXTURES_DELAY_MS` in [supabase/.env.fixtures](supabase/.env.fixtures);
  set to `0` for fast iteration.

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
