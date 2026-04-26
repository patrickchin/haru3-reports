# Deployment / EAS / Supabase / Vercel

Before any deploy, build, or OTA update task, read `docs/02-deployment.md`.

# Merge Workflow

Before merging branches, read `docs/07-merge-workflow.md`.

# Database / RLS

Before changing schema, migrations, or RLS policies, read
`supabase/tests/README.md`. Migration filenames use the timestamp pattern
`YYYYMMDDHHmm_description.sql`.

# Tests

Before adding or changing tests, read `docs/09-testing.md` for the full
strategy (layers, Maestro E2E setup, JS-only rebundle trick, authoring rules).

- All tests:        `pnpm test`
- Mobile (Vitest):  `pnpm test:mobile`
- Edge functions:   `cd supabase/functions/<name> && deno test -A`
- RLS:              see `supabase/tests/README.md`
- Maestro E2E:      `cd apps/mobile && maestro test .maestro/`

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
