#!/usr/bin/env bash
# Sync EAS environment variables from Doppler. (POSIX shells: macOS, Linux.)
# Windows users: see scripts/sync-eas.ps1
#
# Vercel and Supabase have native Doppler integrations (auto-sync via the
# Doppler dashboard). EAS does not, so this script handles only EAS.
#
# Usage: ./scripts/sync-eas.sh <development|preview|production>
# CI:    set DOPPLER_TOKEN to a service token scoped to the chosen config.
#
# Doppler config <-> EAS environment names are 1:1. Only EXPO_PUBLIC_* vars
# are pushed (the rest stay in Doppler).

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
