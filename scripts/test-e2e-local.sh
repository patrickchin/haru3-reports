#!/usr/bin/env bash
#
# Run Maestro E2E flows fully locally.
#
# What this does:
#   1. Starts (or reuses) a local Supabase stack (`supabase start`).
#   2. Resets the database WITHOUT seeding (`supabase db reset --no-seed`).
#      Flows create everything they need via the app UI — including auth users
#      via phone-OTP (fixed codes configured in config.toml [auth.sms.test_otp]).
#   3. Starts the Hono API server with USE_FIXTURES=true so it replays
#      captured LLM/transcription fixtures instead of calling real providers.
#   4. Runs `maestro test apps/mobile-v3/.maestro/`.
#
# Prerequisites:
#   - Supabase CLI installed (`brew install supabase/tap/supabase`)
#   - Docker running
#   - Java 17 (`export JAVA_HOME=$(/usr/libexec/java_home -v 17)`)
#   - Maestro CLI installed
#   - The mobile app already built + installed on the simulator

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
  echo "▶ Resetting local DB without seed (set SKIP_RESET=1 to skip)…"
  supabase db reset --no-seed
fi

echo "▶ Starting Hono API with USE_FIXTURES=true…"
USE_FIXTURES=true pnpm --filter @harpa/api dev &
cleanup_pids+=("$!")

echo "  waiting for API at http://localhost:8080/health …"
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8080/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "▶ Running Maestro flows…"
cd apps/mobile-v3
maestro test "$@" .maestro/
