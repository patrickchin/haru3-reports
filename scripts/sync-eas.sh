#!/usr/bin/env bash
# Sync EAS environment variables from Doppler.
#
# Vercel and Supabase have native Doppler integrations (auto-sync via the
# Doppler dashboard). EAS does not, so this script handles only EAS.
#
# Usage: ./scripts/sync-eas.sh development | preview | production
# CI:    set DOPPLER_TOKEN to a service token scoped to the chosen config.
#
# Doppler config <-> EAS environment mapping (1:1 names):
#   Doppler "development" -> EAS "development"
#   Doppler "preview"     -> EAS "preview"
#   Doppler "production"  -> EAS "production"
#
# Only EXPO_PUBLIC_* variables are pushed (the only secrets EAS Build needs
# beyond what's already in app.config.ts).

set -euo pipefail

EAS_ENV="${1:?Usage: $0 <development|preview|production>}"
case "$EAS_ENV" in
  development|preview|production) ;;
  *) echo "Unknown EAS environment: $EAS_ENV" >&2; exit 64 ;;
esac

TMP=apps/mobile/.env.sync
trap 'rm -f "$TMP"' EXIT

doppler secrets download \
  --project harpa-pro --config "$EAS_ENV" \
  --no-file --format env \
  | grep -E '^EXPO_PUBLIC_' > "$TMP"

( cd apps/mobile && eas env:push --environment "$EAS_ENV" --path .env.sync --force )
