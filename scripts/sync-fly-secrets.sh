#!/usr/bin/env bash
# Sync Fly.io secrets from Doppler.
#
# Usage: ./scripts/sync-fly-secrets.sh [development|preview|production]
#        Defaults to `development`.
#
# Doppler reserves the SUPABASE_ prefix (Supabase integration), so we
# rename EXPO_PUBLIC_SUPABASE_URL -> SUPABASE_URL and SERVICE_ROLE_KEY
# -> SUPABASE_SERVICE_ROLE_KEY on the way in. Everything else passes
# through unchanged.

set -euo pipefail

CONFIG="${1:-development}"
FLY_APP="${FLY_APP:-harpa-api}"

doppler secrets download --project harpa-pro --config "$CONFIG" \
    --no-file --format env \
  | sed \
      -e 's/^EXPO_PUBLIC_SUPABASE_URL=/SUPABASE_URL=/' \
      -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/' \
  | flyctl secrets import --app "$FLY_APP" --stage
