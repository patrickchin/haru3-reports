#!/usr/bin/env bash
# Sync secrets from Doppler to Supabase + EAS in bulk.
#
# Source of truth: Doppler (project: harpa-pro, configs: development | staging | production).
# Vercel is intentionally NOT handled here — enable Doppler's native Vercel
# integration in the dashboard instead (it auto-syncs on every change).
#
# Usage:
#   ./scripts/sync-secrets.sh development | staging | production
#
# CI: set DOPPLER_TOKEN to a service token scoped to the chosen config.
#
# Variable selection (by prefix):
#   - Supabase fn secrets : everything except SUPABASE_*, EXPO_*, VITE_*,
#                           DOPPLER_*, MAESTRO_*, EAS_*  (server-only)
#   - EAS env vars        : EXPO_PUBLIC_*

set -euo pipefail

CONFIG="${1:?Usage: $0 <development|staging|production>}"
case "$CONFIG" in
  development|staging|production) ;;
  *) echo "Unknown config: $CONFIG" >&2; exit 64 ;;
esac
EAS_ENV="$CONFIG"  # EAS uses the same names

ENV_FILE=$(mktemp)
trap 'rm -f "$ENV_FILE"' EXIT

doppler secrets download --project harpa-pro --config "$CONFIG" \
  --no-file --format env > "$ENV_FILE"

REF=$(awk -F= '$1=="SUPABASE_PROJECT_REF"{gsub(/"/,"",$2); print $2}' "$ENV_FILE")
[[ -n "$REF" ]] || { echo "SUPABASE_PROJECT_REF missing in '$CONFIG'"; exit 1; }

# Supabase: server-side keys only (strip client + meta vars).
echo "==> Supabase fn secrets → $REF"
grep -Ev '^(SUPABASE_|EXPO_|VITE_|DOPPLER_|MAESTRO_|EAS_)' "$ENV_FILE" \
  | supabase secrets set --project-ref "$REF" --env-file /dev/stdin

# EAS: just the EXPO_PUBLIC_* vars.
echo "==> EAS env:push → $EAS_ENV"
grep -E '^EXPO_PUBLIC_' "$ENV_FILE" > apps/mobile/.env.sync
( cd apps/mobile && eas env:push --environment "$EAS_ENV" --path .env.sync --force )
rm -f apps/mobile/.env.sync

echo "==> Done."
