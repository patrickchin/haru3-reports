#!/usr/bin/env bash
# scripts/sync-fly-secrets.sh
#
# Pipes Doppler `harpa-pro/<config>` into `flyctl secrets import` for
# the `harpa-api` app. Idempotent — Fly only updates changed values.
#
# Why a mapping table:
#   Doppler reserves the `SUPABASE_` prefix for its official Supabase
#   integration, so we can't store `SUPABASE_URL` directly. We read
#   from the un-prefixed Doppler names the rest of the repo already
#   uses (`EXPO_PUBLIC_SUPABASE_URL`, `SERVICE_ROLE_KEY`) and rename
#   them to what `packages/api/src/env.ts` expects on the Fly side.
#
# Prerequisites:
#   - flyctl logged in (or FLY_API_TOKEN exported)
#   - doppler CLI authenticated for project `harpa-pro`
#
# Usage:
#   ./scripts/sync-fly-secrets.sh                  # production -> harpa-api
#   ./scripts/sync-fly-secrets.sh staging          # staging -> harpa-api
#   FLY_APP=harpa-api-staging ./scripts/sync-fly-secrets.sh staging

set -euo pipefail

DOPPLER_CONFIG="${1:-production}"
FLY_APP="${FLY_APP:-harpa-api}"

# Each entry: "DOPPLER_NAME=FLY_NAME". When the two are identical, just
# list the name once.
SECRET_MAP=(
  "EXPO_PUBLIC_SUPABASE_URL=SUPABASE_URL"
  "SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY"
  "DATABASE_URL"
  "ALLOWED_ORIGINS"
  "SENTRY_DSN"
  "REVIEW_ACCESS_KEY"
  "UPSTASH_REDIS_REST_URL"
  "UPSTASH_REDIS_REST_TOKEN"
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "GOOGLE_AI_API_KEY"
  "MOONSHOT_API_KEY"
  "ZAI_API_KEY"
  "DEEPSEEK_API_KEY"
  "GROQ_API_KEY"
  "DEEPGRAM_API_KEY"
)

echo "Syncing Doppler[$DOPPLER_CONFIG] -> Fly[$FLY_APP]…" >&2

{
  for entry in "${SECRET_MAP[@]}"; do
    if [[ "$entry" == *"="* ]]; then
      doppler_name="${entry%%=*}"
      fly_name="${entry##*=}"
    else
      doppler_name="$entry"
      fly_name="$entry"
    fi

    value=$(doppler secrets get "$doppler_name" \
              --project harpa-pro \
              --config "$DOPPLER_CONFIG" \
              --plain 2>/dev/null || true)

    if [[ -n "$value" ]]; then
      printf '%s=%s\n' "$fly_name" "$value"
    else
      echo "  (skip) $doppler_name not set in Doppler[$DOPPLER_CONFIG]" >&2
    fi
  done
} | flyctl secrets import --app "$FLY_APP" --stage

echo "Staged. Run 'flyctl deploy --app $FLY_APP --remote-only' to apply." >&2
