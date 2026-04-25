#!/usr/bin/env bash
# Run RLS integration tests against the local `supabase start` stack.
# Resets the DB (re-applies all migrations + seed) so each run is isolated.
#
# Usage:
#   scripts/test-rls-local.sh           # reset + test
#   SKIP_RESET=1 scripts/test-rls-local.sh   # keep existing local data
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI not found. Install: brew install supabase/tap/supabase" >&2
  exit 1
fi

# Start the stack if not running. `supabase status` exits non-zero when down.
if ! supabase status >/dev/null 2>&1; then
  echo "==> supabase start"
  supabase start
fi

if [ "${SKIP_RESET:-0}" != "1" ]; then
  echo "==> supabase db reset (re-apply migrations + seed)"
  supabase db reset
fi

# Capture URL + anon key from the running stack.
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')"
export SUPABASE_URL="${API_URL}"
export SUPABASE_ANON_KEY="${ANON_KEY}"

echo "==> vitest run (RLS) against ${SUPABASE_URL}"
exec pnpm --filter mobile exec vitest run \
  --config ../../supabase/tests/vitest.config.ts \
  --dir ../../supabase/tests
