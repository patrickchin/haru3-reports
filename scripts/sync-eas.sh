#!/usr/bin/env bash
# Sync EAS environment variables from Doppler.
# Windows users: see scripts/sync-eas.ps1
#
# Usage: ./scripts/sync-eas.sh <development|preview|production>

set -euo pipefail

EAS_ENV="${1:?Usage: $0 <development|preview|production>}"
case "$EAS_ENV" in
  development|preview|production) ;;
  *) echo "Unknown EAS environment: $EAS_ENV" >&2; exit 64 ;;
esac

TMP=apps/mobile-v3/.env.sync
trap 'rm -f "$TMP"' EXIT

doppler secrets download \
  --project harpa-pro --config "$EAS_ENV" \
  --no-file --format env \
  | grep -E '^EXPO_PUBLIC_' > "$TMP"

( cd apps/mobile-v3 && eas env:push --environment "$EAS_ENV" --path .env.sync --force )
