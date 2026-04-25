#!/usr/bin/env bash
# Sync secrets from Doppler to Supabase, Vercel, and EAS.
#
# Source of truth: Doppler (project: harpa-pro, configs: dev | stg | prd).
# Targets:
#   - Supabase edge function secrets (per project ref)
#   - Vercel environment variables (per Vercel env: development | preview | production)
#   - EAS environment variables (per EAS environment: development | preview | production)
#
# Usage:
#   doppler login                          # one-time
#   ./scripts/sync-secrets.sh dev          # sync the "dev" Doppler config
#   ./scripts/sync-secrets.sh stg
#   ./scripts/sync-secrets.sh prd
#
# In CI, set DOPPLER_TOKEN to a service-token scoped to the right config and
# pass the config name as $1.

set -euo pipefail

CONFIG="${1:-}"
if [[ -z "$CONFIG" ]]; then
  echo "Usage: $0 <dev|stg|prd>" >&2
  exit 64
fi

case "$CONFIG" in
  dev) VERCEL_ENV="development"; EAS_ENV="development" ;;
  stg) VERCEL_ENV="preview";     EAS_ENV="preview"     ;;
  prd) VERCEL_ENV="production";  EAS_ENV="production"  ;;
  *) echo "Unknown config: $CONFIG" >&2; exit 64 ;;
esac

echo "==> Syncing Doppler config '$CONFIG' → vercel:$VERCEL_ENV, eas:$EAS_ENV"

# --- Required tooling --------------------------------------------------------
command -v doppler  >/dev/null || { echo "doppler CLI not installed"; exit 1; }
command -v supabase >/dev/null || { echo "supabase CLI not installed"; exit 1; }
command -v vercel   >/dev/null || { echo "vercel CLI not installed"; exit 1; }
command -v eas      >/dev/null || { echo "eas-cli not installed";    exit 1; }
command -v jq       >/dev/null || { echo "jq not installed";         exit 1; }

# --- Pull all secrets as JSON once ------------------------------------------
SECRETS_JSON="$(doppler secrets download \
  --project harpa-pro --config "$CONFIG" \
  --no-file --format json)"

get() { jq -r --arg k "$1" '.[$k] // empty' <<<"$SECRETS_JSON"; }

# --- Variable groups --------------------------------------------------------
# Server-only secrets that go to Supabase edge functions.
# NOTE: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY /
# SUPABASE_DB_URL / SUPABASE_JWKS are auto-injected by Supabase into the
# function runtime — DO NOT manage them here.
SUPABASE_FN_VARS=(
  AI_PROVIDER
  OPENAI_API_KEY
  ANTHROPIC_API_KEY
  GOOGLE_AI_API_KEY
  MOONSHOT_API_KEY
  GROQ_API_KEY
  TRANSCRIPTION_PROVIDER
  REVIEW_ACCESS_KEY
  ADMIN_WEB_DISPLAY_NAME
  ADMIN_WEB_USERNAME
  ADMIN_WEB_PASSWORD
  ADMIN_WEB_JWT_SECRET
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_CONTENT_SID
  TWILIO_MESSAGE_SERVICE_SID
  TWILIO_VERIFY_SERVICE_SID
)

# Public client vars exposed to the Vercel-built web/admin/playground.
VERCEL_VARS=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
)

# Public client vars exposed to the Expo/EAS mobile build.
EAS_VARS=(
  EXPO_PUBLIC_SUPABASE_URL
  EXPO_PUBLIC_SUPABASE_ANON_KEY
)

# Sensitive (encrypted) EAS variables — visibility=sensitive in EAS.
EAS_VARS_SENSITIVE=(
  EXPO_PUBLIC_SENTRY_DSN
)

SUPABASE_PROJECT_REF="$(get SUPABASE_PROJECT_REF)"
if [[ -z "$SUPABASE_PROJECT_REF" ]]; then
  echo "SUPABASE_PROJECT_REF missing in Doppler config '$CONFIG'" >&2
  exit 1
fi

# --- 1. Supabase edge function secrets --------------------------------------
echo "==> Supabase: setting edge function secrets on $SUPABASE_PROJECT_REF"
SUPA_ARGS=()
for k in "${SUPABASE_FN_VARS[@]}"; do
  v="$(get "$k")"
  if [[ -n "$v" ]]; then
    SUPA_ARGS+=("$k=$v")
  fi
done
if [[ ${#SUPA_ARGS[@]} -gt 0 ]]; then
  supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" "${SUPA_ARGS[@]}"
else
  echo "  (no Supabase fn vars present in this config)"
fi

# --- 2. Vercel env vars ------------------------------------------------------
# Requires VERCEL_TOKEN in env and `vercel link` performed once locally
# (or VERCEL_ORG_ID + VERCEL_PROJECT_ID in env in CI).
echo "==> Vercel: setting $VERCEL_ENV env vars"
for k in "${VERCEL_VARS[@]}"; do
  v="$(get "$k")"
  [[ -z "$v" ]] && continue
  vercel env rm "$k" "$VERCEL_ENV" --yes >/dev/null 2>&1 || true
  printf '%s' "$v" | vercel env add "$k" "$VERCEL_ENV" >/dev/null
  echo "  set $k"
done

# --- 3. EAS env vars ---------------------------------------------------------
# Requires EXPO_TOKEN in env.
echo "==> EAS: setting $EAS_ENV env vars"
pushd apps/mobile >/dev/null

set_eas_var() {
  local name="$1" value="$2" visibility="$3"
  [[ -z "$value" ]] && return 0
  # `eas env:create --force` upserts.
  eas env:create \
    --environment "$EAS_ENV" \
    --name "$name" \
    --value "$value" \
    --visibility "$visibility" \
    --force --non-interactive >/dev/null
  echo "  set $name ($visibility)"
}

for k in "${EAS_VARS[@]}";           do set_eas_var "$k" "$(get "$k")" plaintext;  done
for k in "${EAS_VARS_SENSITIVE[@]}"; do set_eas_var "$k" "$(get "$k")" sensitive;  done

popd >/dev/null

echo "==> Done."
