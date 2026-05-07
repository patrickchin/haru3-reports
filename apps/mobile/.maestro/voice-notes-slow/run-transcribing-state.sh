#!/usr/bin/env zsh
# Runs voice-notes-slow/transcribing-state.yaml with FIXTURES_DELAY_MS
# set high enough that the transient "Transcribing…" placeholder
# reliably survives Maestro's polling interval. See the comment block
# at the top of transcribing-state.yaml for the why.
#
# This flow lives in `voice-notes-slow/` (not `voice-notes/`) on
# purpose: it MUST be opted into via this wrapper. A plain
# `maestro test .maestro/voice-notes/` will not pick it up.
#
# Restores the previous FIXTURES_DELAY_MS in supabase/.env.fixtures on
# exit (success OR failure) and restarts `supabase functions serve` so
# the rest of the local dev loop is back to fast-iteration mode.
set -eu

REPO_ROOT="${0:A:h:h:h:h:h}"  # apps/mobile/.maestro/voice-notes-slow/<this> -> repo root
ENV_FILE="${REPO_ROOT}/supabase/.env.fixtures"
DELAY_MS="${FIXTURES_DELAY_MS_FOR_TRANSCRIBING:-3000}"

if [[ ! -f "$ENV_FILE" ]]; then
  print -u2 "error: ${ENV_FILE} not found"
  exit 1
fi

# Capture original value so we can restore it.
ORIG_LINE=$(grep -E '^FIXTURES_DELAY_MS=' "$ENV_FILE" || echo 'FIXTURES_DELAY_MS=0')

restore() {
  print "[run-transcribing-state] restoring ${ORIG_LINE}"
  if grep -qE '^FIXTURES_DELAY_MS=' "$ENV_FILE"; then
    sed -i.bak -E "s|^FIXTURES_DELAY_MS=.*|${ORIG_LINE}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    print "${ORIG_LINE}" >> "$ENV_FILE"
  fi
  pkill -f 'supabase functions serve' 2>/dev/null || true
  sleep 1
  ( cd "$REPO_ROOT" && nohup supabase functions serve --env-file supabase/.env.fixtures --no-verify-jwt >/tmp/fns-restore.log 2>&1 & disown )
}
trap restore EXIT INT TERM

# Apply elevated delay.
print "[run-transcribing-state] setting FIXTURES_DELAY_MS=${DELAY_MS}"
if grep -qE '^FIXTURES_DELAY_MS=' "$ENV_FILE"; then
  sed -i.bak -E "s|^FIXTURES_DELAY_MS=.*|FIXTURES_DELAY_MS=${DELAY_MS}|" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
else
  print "FIXTURES_DELAY_MS=${DELAY_MS}" >> "$ENV_FILE"
fi
pkill -f 'supabase functions serve' 2>/dev/null || true
sleep 1
( cd "$REPO_ROOT" && nohup supabase functions serve --env-file supabase/.env.fixtures --no-verify-jwt >/tmp/fns-transcribing.log 2>&1 & disown )
sleep 5

print "[run-transcribing-state] launching maestro"
cd "${REPO_ROOT}/apps/mobile"
JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}" \
  /Users/patchin/.maestro/bin/maestro test \
    .maestro/voice-notes-slow/transcribing-state.yaml
