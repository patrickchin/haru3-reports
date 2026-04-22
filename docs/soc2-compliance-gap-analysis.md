# SOC 2 Compliance Gap Analysis — Mobile App

> **Date**: 2026-04-22
> **Scope**: Harpa Pro mobile app (`apps/mobile/`), Supabase backend (`supabase/`)

---

## Current Strengths

| Area | Detail |
|------|--------|
| **Row-Level Security** | Comprehensive RLS policies on all user-data tables (`profiles`, `projects`, `reports`, `token_usage`, `project_members`) |
| **Authentication** | OTP-based phone auth via Supabase + Twilio with refresh token rotation (`refresh_token_reuse_interval = 10`) |
| **Transport Security** | HTTPS-only API communication; Supabase SDK enforces TLS |
| **Secret Isolation** | LLM API keys (OpenAI, Anthropic, Google AI, Moonshot) kept server-side in edge functions; only public anon key reaches the client |
| **XSS Prevention** | HTML escaping in report generation (`report-to-html.ts`) with dedicated test coverage |
| **Timing-Safe Comparisons** | Access key validation in `generate-report-playground` uses constant-time comparison |
| **Soft Deletes** | `deleted_at` timestamps preserve audit trails (`202604180001_soft_delete.sql`) |
| **Build Channels** | Separate development, preview, and production build profiles in `eas.json` |
| **Security Definer Functions** | `get_project_team()` exposes only safe columns, preventing phone number leakage to teammates |
| **RBAC** | Project members have roles (owner, admin, editor, viewer) enforced via RLS |

---

## Critical Gaps

### 1. Encrypted Local Storage

**SOC 2 Control**: CC6.1 (Logical and Physical Access Controls)

**Current state**: `apps/mobile/lib/backend.ts` uses `AsyncStorage` (plaintext on disk) to persist Supabase session tokens.

**Risk**: On a compromised or jailbroken device, auth tokens can be extracted from the filesystem.

**Remediation**: Replace `AsyncStorage` with `expo-secure-store`, which uses iOS Keychain and Android Keystore for encryption at rest.

**Priority**: High

---

### 2. Hardcoded Test Credentials

**SOC 2 Control**: CC6.1

**Current state**: `apps/mobile/lib/auth.tsx` contains a `SEED_CREDENTIALS` array with test email/password pairs and a `isDevPhoneAuthEnabled` toggle controlled by `EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH`.

**Risk**: If included in production builds, test credentials could bypass normal authentication. The env-var toggle could be misconfigured to enable dev auth in production.

**Remediation**:
- Remove `SEED_CREDENTIALS` from source or gate behind `__DEV__` (stripped at compile time).
- Ensure `isDevPhoneAuthEnabled` is only true when `__DEV__` is true, not via an env var.

**Priority**: Critical

---

### 3. Audit Logging

**SOC 2 Control**: CC7.2 (System Monitoring), CC4.1 (Monitoring Activities)

**Current state**: No structured logging for authentication events (login, logout, failed attempts), data access, or permission changes. Only `console.error` calls exist.

**Risk**: Cannot investigate security incidents, demonstrate access control enforcement, or produce evidence for auditors.

**Remediation**:
- Create an `audit_logs` table in Supabase with columns for event type, actor, resource, timestamp, and metadata.
- Log auth events from edge functions and/or Supabase auth hooks.
- Integrate a SIEM or log aggregation service (Sentry, Datadog, or Supabase Logflare).

**Priority**: Critical

---

### 4. Multi-Factor Authentication

**SOC 2 Control**: CC6.1, CC6.6 (System Operations)

**Current state**: Only SMS OTP authentication exists. No second factor.

**Risk**: SMS is vulnerable to SIM-swapping attacks. SOC 2 auditors expect MFA for access to sensitive data.

**Remediation**: Add TOTP (authenticator app) support via Supabase MFA and/or backup codes as a second factor.

**Priority**: High

---

### 5. Rate Limiting on Auth Endpoints

**SOC 2 Control**: CC6.1

**Current state**: Rate limiting is implemented on `generate-report-playground` (30 req/min per IP) but not on auth endpoints (OTP send/verify).

**Risk**: Brute-force OTP guessing or OTP flooding (SMS bombing).

**Remediation**:
- Add rate limiting to Supabase auth endpoints or at the edge (e.g., Supabase rate limits config, or a middleware layer).
- Consider exponential backoff on failed OTP attempts.

**Priority**: High

---

### 6. Error Log Scrubbing

**SOC 2 Control**: CC6.1, CC7.2

**Current state**: `console.error` calls in `auth.tsx` and `_layout.tsx` log full error objects, which may contain user IDs, database query details, or API response bodies.

**Risk**: Sensitive data in logs could be exposed via device log exports or crash reporting.

**Remediation**:
- Replace `console.error` with a structured logger that scrubs PII and sensitive fields.
- Disable verbose logging in production builds.
- If using a crash reporting service, configure PII filters.

**Priority**: Medium

---

### 7. Secret Rotation Policy

**SOC 2 Control**: CC6.2 (Credential Lifecycle Management)

**Current state**: No documented process for rotating Supabase keys, LLM API keys, Twilio credentials, or the Supabase service role key.

**Risk**: Compromised keys remain valid indefinitely. Auditors require evidence of key rotation schedules.

**Remediation**:
- Document rotation schedules (e.g., quarterly for API keys).
- Automate rotation where possible (Supabase key regeneration, Twilio API key rotation).
- Maintain a secrets inventory with last-rotated dates.

**Priority**: Medium

---

### 8. Backup & Disaster Recovery

**SOC 2 Control**: CC9.1 (Availability), A1.2 (Recovery Objectives)

**Current state**: No documented backup policy, PITR (point-in-time recovery) configuration, or disaster recovery plan.

**Risk**: Data loss with no recovery path. Auditors require documented RPO/RTO and tested recovery procedures.

**Remediation**:
- Enable Supabase PITR (available on Pro plan).
- Document RPO (Recovery Point Objective) and RTO (Recovery Time Objective).
- Test backup restoration at least annually and keep evidence.

**Priority**: Medium

---

### 9. Certificate Pinning

**SOC 2 Control**: CC6.1

**Current state**: The mobile app relies on the device's system certificate store. No TLS certificate pinning.

**Risk**: A compromised or malicious CA on the device could intercept API traffic (MITM).

**Remediation**: Implement certificate pinning for the Supabase API domain using a library like `react-native-ssl-pinning` or Expo's network security config.

**Priority**: Low (defense-in-depth)

---

### 10. Dependency Vulnerability Scanning

**SOC 2 Control**: CC7.1 (Vulnerability Management)

**Current state**: No `npm audit`, Dependabot, Snyk, or equivalent integration visible in the repository.

**Risk**: Known vulnerabilities in third-party packages go undetected.

**Remediation**:
- Enable Dependabot or Snyk on the repository.
- Add `pnpm audit` to the CI pipeline with a failing threshold.
- Review and remediate alerts on a defined cadence (e.g., weekly for critical, monthly for moderate).

**Priority**: High

---

## Organizational Requirements (Non-Code)

These are required for SOC 2 Type II but are not code changes:

| SOC 2 Area | Requirement | Status |
|---|---|---|
| **Security Policies** | Written information security policy, acceptable use policy, data classification policy | Not documented |
| **Change Management** | Documented approval and review process for code changes (PR reviews, approvals) | Partially in place (git workflow exists, formalization needed) |
| **Vendor Management** | Risk assessments for Supabase, Twilio, OpenAI, Anthropic, Google AI, Expo | Not documented |
| **Access Reviews** | Periodic reviews of who has production access (Supabase dashboard, Vercel, EAS) | Not documented |
| **Penetration Testing** | Annual third-party penetration test | Not conducted |
| **Employee Training** | Security awareness training records for all team members | Not documented |
| **Incident Response** | Written IR plan with roles, escalation paths, communication templates, and post-mortems | Not documented |
| **Risk Assessment** | Formal risk assessment identifying threats, likelihood, and mitigations | Not documented |
| **Business Continuity** | Continuity plan covering service disruptions, provider outages | Not documented |

---

## Implementation Priority

### Phase 1 — Blocking Issues (do first)

1. Remove or gate hardcoded credentials (`SEED_CREDENTIALS`)
2. Switch to `expo-secure-store` for token storage
3. Add audit logging table and auth event logging
4. Add rate limiting on auth endpoints
5. Enable dependency vulnerability scanning in CI

### Phase 2 — Core Compliance

6. Write security policies (InfoSec policy, acceptable use, incident response)
7. Add MFA (TOTP support)
8. Implement error log scrubbing
9. Document secret rotation policy and conduct initial rotation
10. Conduct vendor risk assessments

### Phase 3 — Hardening & Evidence

11. Enable Supabase PITR and document backup/DR plan
12. Implement certificate pinning
13. Conduct penetration test
14. Establish access review cadence
15. Set up security awareness training

---

## References

- [SOC 2 Trust Services Criteria](https://www.aicpa.org/resources/landing/system-and-organization-controls-soc-suite-of-services)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
- [Expo Security Guidelines](https://docs.expo.dev/guides/security/)
- [OWASP Mobile Top 10](https://owasp.org/www-project-mobile-top-10/)
