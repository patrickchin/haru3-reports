# SOC 2 Compliance — Implementation Notes

> Companion to [`docs/features/03-soc2-compliance-gap-analysis.md`](features/03-soc2-compliance-gap-analysis.md).
> This file documents the controls that have been implemented in code/config
> and the operational policies (rotation, backup/DR, certificate pinning,
> incident response) that auditors expect to find written down.

---

## What's implemented in this repo

| Gap (from analysis)              | Control                  | Where                                                                                  |
|----------------------------------|--------------------------|----------------------------------------------------------------------------------------|
| 1. Encrypted local storage       | CC6.1                    | `apps/mobile/lib/secure-storage.ts` + `apps/mobile/lib/backend.ts` (expo-secure-store) |
| 3. Audit logging                 | CC4.1, CC7.2             | `supabase/migrations/202605010001_audit_logs.sql`, `apps/mobile/lib/audit-log.ts`      |
| 5. Auth rate limiting            | CC6.1                    | `supabase/config.toml` → `[auth.rate_limit]`                                           |
| 6. Error log scrubbing           | CC6.1, CC7.2             | `apps/mobile/lib/logger.ts` (PII/UUID/IP/JWT scrubbing)                                |
| 10. Dependency vulnerability scan| CC7.1                    | `.github/workflows/security-checks.yml` (already existed)                              |

Excluded from this implementation pass (separate tickets):

- Gap 2 (hardcoded test credentials) — see `lib/auth-security.ts` rework.
- Gap 4 (MFA / TOTP) — requires Supabase MFA enrollment UI.

---

## Audit logging

**Table**: `public.audit_logs` (append-only).

**Insert path**: clients call the `record_audit_event(p_event_type, p_outcome,
p_resource, p_resource_id, p_metadata)` RPC (SECURITY DEFINER). The RPC
stamps `actor_id` from `auth.uid()` so users cannot forge events for other
users.

**Read path**: RLS allows users to SELECT only their own rows. Operators
read all rows via the service role (Supabase dashboard / SQL editor).

**Currently logged events** (see `apps/mobile/lib/auth.tsx`):

- `auth.otp.send` — success/failure of OTP request
- `auth.login`    — success/failure of OTP verification
- `auth.logout`   — success/failure of sign-out

Add new events by importing `recordAuditEvent({ event_type, ... })` at the
relevant call site. Always include `outcome: "failure" | "denied"` for
negative paths.

**Retention**: 12 months (target). Operationally this is enforced via a
Supabase scheduled function or `pg_cron` job; document the cron expression
in `02-deployment.md` once provisioned.

---

## Secret rotation policy

Source of truth for all secrets is **Doppler** (see `08-secrets-management.md`).

| Secret                                   | Rotation cadence | Owner            |
|------------------------------------------|------------------|------------------|
| `SUPABASE_SERVICE_ROLE_KEY`              | 90 days          | Platform         |
| `SUPABASE_ANON_KEY` (if compromised)     | On compromise    | Platform         |
| `OPENAI_API_KEY`                         | 90 days          | AI / Platform    |
| `ANTHROPIC_API_KEY`                      | 90 days          | AI / Platform    |
| `GOOGLE_AI_API_KEY`                      | 90 days          | AI / Platform    |
| `MOONSHOT_API_KEY` / `ZAI_API_KEY` / `DEEPSEEK_API_KEY` | 90 days | AI / Platform |
| `TWILIO_AUTH_TOKEN` / `TWILIO_API_KEY`   | 90 days          | Platform         |
| `REVIEW_ACCESS_KEY` (playground)         | 30 days          | Platform         |
| EAS / Vercel API tokens                  | 90 days          | Platform         |

**Process**:

1. Generate new value in the provider dashboard.
2. Update the value in Doppler (the relevant config: `production`,
   `preview`, or `development`).
3. Vercel + Supabase pick up the change automatically; for EAS run
   `scripts/sync-eas.sh production`.
4. Revoke the old value in the provider dashboard once deploys are verified.
5. Record the rotation in the secrets inventory (Doppler activity log
   counts; export quarterly to retain for the audit window).

**On compromise**: rotate immediately, force-revoke active sessions
(Supabase: `auth.users` → reset refresh tokens), and review `audit_logs`
for unexpected `auth.login` / data-access activity since the suspected
compromise window.

---

## Backup & disaster recovery

**Backups** (Supabase-managed):

- **Daily snapshots**: enabled on Pro plan (default 7-day retention).
- **PITR (point-in-time recovery)**: enable on the production project
  → Settings → Database → Backups. Retention target: 7 days.

**Recovery objectives**:

| Metric | Target |
|--------|--------|
| RPO (Recovery Point Objective) | ≤ 5 minutes (PITR) |
| RTO (Recovery Time Objective)  | ≤ 4 hours          |

**Restore drill**: clone the production database to a staging project at
least once per year. Verify a known fixture report is readable. Record
date + result in the SOC 2 evidence binder.

**Edge function code & migrations**: source of truth is git. CI deploys
from `main` (production) and `dev` (preview) — see
`.github/workflows/supabase-deploy.yml`.

**Mobile binary**: EAS retains build artifacts. OTA updates roll back via
`eas update --rollback` (see `02-deployment.md`).

---

## Certificate pinning (mobile)

**Status**: not yet implemented (defense-in-depth, low priority per gap
analysis).

**Plan when implementing**:

- Use Expo's `expo-network` + `react-native-ssl-pinning` (or rebuild with
  custom config plugin).
- Pin to the public key of the Supabase project's API certificate plus
  one backup key (so we can rotate without bricking installed apps).
- Ship a kill-switch: a server-side flag that can disable pinning
  remotely if we need to rotate certs in an emergency before a forced
  app update.
- Document the cert rotation runbook here when implemented.

---

## Incident response (high-level)

Full IR plan lives outside the repo. Code-side hooks:

1. **Detect**: `audit_logs` queries + Sentry/Logflare alerts (TODO: wire
   up alerting on `outcome IN ('failure','denied')` spikes).
2. **Contain**: revoke compromised secrets (see rotation), invalidate
   sessions, push a remote feature flag to disable affected flows.
3. **Investigate**: pull `audit_logs` for the affected actor / resource;
   correlate with edge function logs in Supabase dashboard.
4. **Remediate**: deploy fix on `dev` → `main`; for high-severity issues
   use `eas update` for an OTA fix.
5. **Post-mortem**: write up in `docs/incidents/YYYY-MM-DD-<slug>.md`
   within 7 days. Track follow-up actions to closure.

---

## Operational policies (live outside code)

These are required for a SOC 2 Type II report but are not code changes.
Tracked in the company's GRC tool (or `~/policies/` repo if separate):

- Information Security Policy
- Acceptable Use Policy
- Data Classification Policy
- Change Management Policy (PR review + approval requirement)
- Vendor Risk Assessments (Supabase, Twilio, OpenAI, Anthropic, Google,
  Expo, Vercel, Doppler)
- Quarterly Access Reviews (Supabase, Vercel, EAS, GitHub admins)
- Annual Penetration Test
- Annual Security Awareness Training
- Business Continuity Plan
