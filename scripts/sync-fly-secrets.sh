#!/usr/bin/env bash
# scripts/sync-fly-secrets.sh
#
# Pipes Doppler `harpa-pro/production` (or another config) into `flyctl
# secrets import` for the `harpa-api` app. Idempotent — Fly only updates
# changed values. Run after editing Doppler.
#
# Prerequisites:
#   - flyctl logged in (or FLY_API_TOKEN exported)
#   - doppler CLI configured for the harpa-pro project
#
# Usage:
#   ./scripts/sync-fly-secrets.sh                  # production -> harpa-api
#   ./scripts/sync-fly-secrets.sh staging          # staging -> harpa-api-staging
#
# The script only forwards the variables the API actually consumes
# (defined in packages/api/src/env.ts + provider env keys). Anything
# else in Doppler is ignored.

set -euo pipefail

DOPPLER_CONFIG="${1:-production}"
FLY_APP="${FLY_APP:-harpa-api}"

API_VARS=(
  DATABASE_URL
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  ALLOWED_ORIGINS
  SENTRY_DSN
  REVIEW_ACCESS_KEY
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  OPENAI_API_KEY
  ANTHROPIC_API_KEY
  GOOGLE_AI_API_KEY
  MOONSHOT_API_KEY
  ZAI_API_KEY
  DEEPSEEK_API_KEY
  GROQ_API_KEY
  DEEPGRAM_API_KEY
)

echo "Syncing Doppler[$DOPPLER_CONFIG] -> Fly[$FLY_APP]…" >&2

# Build a key=value stream of the variables that exist in Doppler.
# Values are pulled per-name to avoid spilling unrelated secrets to logs.
{
  for name in "${API_VARS[@]}"; do
    value=$(doppler secrets get "$name" \
              --project harpa-pro \
              --config "$DOPPLER_CONFIG" \
              --plain 2>/dev/null || true)
    if [[ -n "$value" ]]; then
      printf '%s=%s\n' "$name" "$value"
    else
      echo "  (skip) $name not set in Doppler[$DOPPLER_CONFIG]" >&2
    fi
  done
} | flyctl secrets import --app "$FLY_APP" --stage

echo "Staged. Run 'flyctl deploy --app $FLY_APP --remote-only' to apply." >&2
