#!/usr/bin/env bash
#
# Run Maestro E2E flows fully locally — no LLM API calls, no hosted Supabase.
#
# What this does:
#   1. Starts (or reuses) a local Supabase stack (`supabase start`).
#   2. Resets the database and seeds it (`supabase db reset`).
#   3. Serves the generate-report edge function with USE_FIXTURES=true so it
#      replays captured LLM fixtures instead of calling a real provider.
#   4. Runs `maestro test apps/mobile/.maestro/`.
#
# Prerequisites:
#   - Supabase CLI installed (`brew install supabase/tap/supabase`)
#   - Docker running
#   - Java 17 (`export JAVA_HOME=$(/usr/libexec/java_home -v 17)`)
#   - Maestro CLI installed
#   - The mobile app already built + installed on the simulator (see
#     docs/09-testing.md for the release-build steps).
#
# This script does NOT build the mobile app — point it at an installed binary
# whose Supabase URL is the local stack (http://127.0.0.1:54321 by default).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

cleanup_pids=()
cleanup() {
  for pid in "${cleanup_pids[@]:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT

echo "▶ Starting local Supabase stack…"
if ! supabase status >/dev/null 2>&1; then
  supabase start
fi

if [ "${SKIP_RESET:-0}" != "1" ]; then
  echo "▶ Resetting local DB (set SKIP_RESET=1 to skip)…"
  supabase db reset
fi

echo "▶ Serving generate-report with USE_FIXTURES=true…"
supabase functions serve generate-report \
  --env-file supabase/.env.fixtures \
  --no-verify-jwt &
cleanup_pids+=("$!")

# Wait for the function server to come up. supabase functions serve doesn't
# expose a health endpoint; poll the function with a trivial GET (lists
# providers) until it responds.
SUPABASE_URL="$(supabase status -o env | awk -F'=' '/^API_URL=/ {gsub(/"/,"",$2); print $2}')"
ANON_KEY="$(supabase status -o env | awk -F'=' '/^ANON_KEY=/ {gsub(/"/,"",$2); print $2}')"

echo "  waiting for ${SUPABASE_URL}/functions/v1/generate-report …"
for _ in $(seq 1 30); do
  if curl -fsS "${SUPABASE_URL}/functions/v1/generate-report" \
       -H "Authorization: Bearer ${ANON_KEY}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "▶ Running Maestro flows…"
cd apps/mobile
maestro test "$@" .maestro/
