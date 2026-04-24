# TODO

## Token Usage & Billing

- [x] Per-account token usage tracking
  - ~~Add a `token_usage` table~~ — `202604200001_token_usage.sql`
  - ~~Record token counts from `generateText` response~~ — `_shared/llm.ts` → `defaultRecordUsage`
  - ~~Add RLS policies~~ — migration includes row-level security
  - ~~Aggregate endpoint or DB view for per-account totals~~ — `monthly_token_usage` view
  - ~~Surface usage stats in the mobile app~~ — `usage.tsx` screen with monthly breakdown & charts
  - Set per-account quotas / rate limits based on plan tier (see Payment System below)

## Payment System (Subscriptions & IAP)

> Design doc: `docs/features/01-payment-system-design.md`

### Phase 1 — Schema & Backend

- [ ] Migration: `plans` table with seed data (free / pro / team)
- [ ] Migration: `subscriptions` table (one active sub per user, RLS)
- [ ] Migration: `subscription_events` audit log (immutable, RLS)
- [ ] Migration: `user_entitlements` convenience view (joins plans + subscriptions + usage)
- [ ] Migration: add `plan_id` column to `profiles` (default: 'free')
- [ ] New edge function: `subscription-webhook` (RevenueCat webhook handler)
  - Bearer token auth (REVENUECAT_WEBHOOK_SECRET)
  - Idempotency via rc_event_id
  - Upsert subscriptions, log events, update profiles.plan_id
- [ ] New shared module: `_shared/entitlements.ts` (checkEntitlement helper)

### Phase 2 — Quota Enforcement

- [ ] Integrate `checkEntitlement` into `generate-report` edge function
  - Check report count, token budget, provider allowlist, report type allowlist
  - Return 403 with `upgrade_url` when quota exceeded
  - Override provider to plan default if user's selection not allowed
- [ ] Add project-limit enforcement via RLS policy on `projects` INSERT
- [ ] Feature flag: `enable_quota_enforcement` (see Feature Flags section below)

### Phase 3 — Mobile IAP (RevenueCat)

- [ ] Add `react-native-purchases` to `apps/mobile`
- [ ] Configure RevenueCat: products, entitlements, offerings
- [ ] Initialise RevenueCat SDK in `app/_layout.tsx` (link to Supabase user ID)
- [ ] Create `useEntitlement` hook (cached RC state + server sync)
- [ ] Build upgrade/paywall screen (`app/upgrade.tsx`)
- [ ] UI gates: grey out locked providers, report types, show quota bars
- [ ] Update usage screen to show plan name + upgrade CTA
- [ ] Account/settings: show current plan, manage subscription link

### Phase 4 — App Store & Play Store Submission

- [ ] Configure products in App Store Connect (pro monthly/yearly, team monthly/yearly)
- [ ] Configure products in Google Play Console
- [ ] Set up 7-day free trial for Pro (App Store Connect + Play Console)
- [ ] Submit IAP for App Store review
- [ ] Test end-to-end purchase flow in sandbox / test tracks
- [ ] Enable quota enforcement feature flag in production

### Phase 5 — Stripe Web Fallback (Post-Launch)

- [ ] Integrate Stripe as a "Web" store in RevenueCat
- [ ] Add subscribe CTA to `apps/web` marketing site
- [ ] Same `subscription-webhook` handles Stripe events (platform='stripe')

## Report Generation Log

- [ ] Persist generation attempts for debugging and admin visibility
  - Add a `report_generation_log` table (report_id, provider, model, duration_ms, success, error_message, notes_count, finish_reason, created_at)
  - Record each `generateText` call result in the `generate-report` edge function
  - The `admin-reports` detail endpoint already queries this table — just needs the migration
  - Add RLS policies (admin read, owner read own)

## Raw Notes Persistence

- [x] Store voice-to-text notes independently from the generated report
  - ~~`notes text[]` column on `reports` table~~ — in original migration `202603290001_projects_reports.sql`
  - ~~Save notes array on every auto-save in generate screen~~ — `doSave` writes `notes: currentNotes`
  - ~~Load notes on mount and resume from stored notes~~ — generate screen loads `data.notes` and restores state
  - Enables re-generation from stored notes without re-recording

## Report Comments

- [ ] Add commenting on reports for team collaboration
  - Add a `report_comments` table (id, report_id, project_id, author_id, body, edited_at, deleted_at, created_at, updated_at)
  - Denormalize `project_id` for RLS; enforce consistency via trigger
  - RLS: all project members (including viewers) can read and create; edit/soft-delete own; owner/admin can moderate
  - Flat chronological list (no threading in MVP)
  - TanStack Query hooks for list, create, edit, soft-delete
  - `CommentList`, `CommentItem`, `CommentComposer` components below report sections on detail screen
  - 2000-char body limit; plain text only
  - Design doc: `docs/features/report-comments.md`

## Project Activity Feed

- [ ] Lightweight audit log for project-level events
  - Add an `activity_log` table (id, user_id, project_id, action, metadata JSONB, created_at)
  - Record events: report created, report regenerated, project status changed, project created
  - Add RLS policies so users can only read their own project activity
  - Surface as a feed/timeline on the project detail screen

## Per-Project Statistics

- [ ] Aggregate report stats per project via a Postgres view
  - `CREATE VIEW project_stats` — report count, last visit date, report type distribution
  - Zero application code for the data layer, just a migration
  - Surface as a summary card on the project detail screen

## Remove Confidence / Completeness

- [ ] Drop the `confidence` column and completeness scoring — not useful
  - Migration to drop `confidence` from `reports` table
  - Remove `low_confidence` filter from `admin-reports` edge function
  - Remove `CompletenessCard` component and `getReportCompleteness` from report-helpers
  - Remove `confidence: completeness` write in the generate screen
  - Update seed data to drop confidence values

## Draft Auto-Save

- [x] ~~Persist in-progress report to database as draft~~ — drafts save to DB with `status='draft'`; `draft-report-actions.ts` handles delete
- [ ] Local crash-recovery via AsyncStorage
  - Save report + notes to AsyncStorage on each update (debounced)
  - On opening generate screen, check for a saved draft and offer to resume
  - Clear draft on successful save to database

## Edit Saved Reports

- [ ] Allow re-opening a finalized report for editing
  - "Edit" button on report detail screen
  - Navigate to generate screen pre-loaded with existing report data and notes
  - Update the existing report row rather than creating a new one

## Report Search & Filter

- [ ] Add search and filtering to the reports list screen
  - Text search across report titles
  - Filter by report type (daily/safety/incident/inspection/site_visit/progress)
  - Filter by draft vs final status

## Report Status Badges

- [ ] Show draft/final status visually in the reports list
  - Badge or tag on each report card (data already exists in `status` column)
  - Color-coded: draft = amber, final = green

## Share Report

- [x] Share a report from the detail screen
  - ~~Share via native share sheet~~ — PDF share via `expo-sharing` on report detail screen
  - Deep link back into the app for the specific report

## Project Detail Screen

- [x] Add a project overview screen
  - ~~Show project name, address, client, created date~~ — `projects/[projectId]/index.tsx`
  - ~~Quick stats: report count, last visit date~~ — `computeProjectOverviewStats`
  - ~~Navigation to reports list, edit project~~ — action buttons on overview
  - Navigation to activity feed (pending activity feed feature)

## Project Start & End Dates

- [ ] Add date fields to the project form
  - `start_date` and `expected_end_date` columns on `projects` table (migration)
  - Date pickers on the new/edit project form
  - Display on project detail screen

## Archive / Complete Project

- [ ] Surface the existing `status` column in the UI
  - Action on project detail or edit screen to mark as completed/archived
  - Filter or section on the projects list (active vs archived)
  - Archived projects move to a separate section or are hidden by default

## Editable Profile

- [ ] Allow editing name and company on the account screen
  - Switch from read-only to inline-editable fields
  - Save button to update the `profiles` row

## Project Members

- [x] Multi-user project membership with roles
  - ~~`project_members` table~~ — `202604210001_project_members.sql` with Owner/Admin/Editor/Viewer roles
  - ~~Members screen~~ — `projects/[projectId]/members.tsx` with role filters, add/remove members
  - ~~Profiles teammate visibility~~ — `202604210002_profiles_teammate_visibility.sql`

## Soft Delete

- [x] Soft-delete support for projects and reports
  - ~~`deleted_at` column on both tables~~ — `202604180001_soft_delete.sql`
  - ~~RLS policies exclude soft-deleted rows~~

## Report Comments

- [ ] Add a comments / discussion thread to each report
  - `report_comments` table (id, report_id, user_id, body, created_at, updated_at, deleted_at)
  - RLS policies: project members can read; author can edit/delete own comments
  - Comments section on the report detail screen (scrollable thread below report content)
  - Inline reply support (optional: `parent_id` for threaded replies)
  - Push notification when a teammate comments on your report
  - @mention support for tagging project members

## Multi-Language Speech-to-Text

- [ ] Add a language picker for voice transcription
  - Setting on profile screen to choose speech recognition locale (currently hardcoded `en-US`)
  - Pass selected locale to the speech-to-text hook
  - Persist preference in AsyncStorage or profile metadata

## Sentry Crash & Error Reporting

- [ ] Wire up Sentry for production crash/error visibility across mobile + Supabase functions
  - **Install & init (mobile)**
    - `pnpm --filter mobile add @sentry/react-native`
    - Run `npx @sentry/wizard@latest -i reactNative` to add the Expo config plugin and native setup
    - Add `@sentry/react-native/expo` plugin block to `apps/mobile/app.json` plugins array
    - Initialise `Sentry.init({ dsn, tracesSampleRate, profilesSampleRate, environment })` at the top of `apps/mobile/app/_layout.tsx` before any other imports that can throw
    - Wrap the root export with `Sentry.wrap(RootLayout)` so the existing `AppErrorBoundary` reports via `Sentry.captureException` in `componentDidCatch`
  - **Config & secrets**
    - Create a Sentry project (React Native) and store `SENTRY_DSN` + `SENTRY_AUTH_TOKEN` in EAS secrets (`eas secret:create`)
    - Expose DSN as `EXPO_PUBLIC_SENTRY_DSN` in `app.config.ts` so it is embedded at build time
    - Never ship the auth token in the bundle — only used by EAS for source map upload
  - **Source maps & symbols (critical for readable stacks)**
    - Configure `@sentry/react-native/expo` plugin to upload JS source maps on every EAS build
    - Enable iOS dSYM upload (post-build hook in `eas.json` or Sentry's Xcode build phase)
    - Enable Android ProGuard/R8 mapping upload for release builds
    - Tag each upload with `release = ${expo.version}+${buildNumber}` and `dist = ${buildNumber}`
  - **User & release context**
    - Call `Sentry.setUser({ id: session.user.id })` in `lib/auth` once the Supabase session loads; clear on sign-out
    - Tag events with `project_id`, `report_id`, and `ai_provider` where relevant (breadcrumbs in `useReportGeneration`, `export-report-pdf`, AI provider calls)
    - Set `release` + `dist` from `expo-application` so OTA updates are traceable
  - **Error boundary integration**
    - Update `AppErrorBoundary` in `app/_layout.tsx` to call `Sentry.captureException(error, { contexts: { react: { componentStack } } })`
    - Add route-level boundaries around the generate screen and PDF preview modal (highest crash surface area)
  - **Supabase Edge Functions**
    - Add `@sentry/deno` (or `sentry-deno`) to `supabase/functions/_shared/`
    - Wrap `generate-report`, `generate-report-playground`, and `admin-reports` handlers so LLM failures and Zod parse errors are reported with request metadata
    - Use a separate Sentry project (or environment tag `edge-function`) to avoid mixing with mobile events
  - **Performance & session tracking (optional, phase 2)**
    - Enable tracing for React Navigation transitions via `Sentry.ReactNavigationInstrumentation`
    - Sample at 10-20% in production to control quota
    - Track slow AI generation calls as custom transactions
  - **Ops**
    - Set up Slack/email alerts for new issues and regression spikes
    - Add release health dashboards (crash-free users / sessions) to weekly review
    - Document the "symbolicate a crash" runbook in `docs/`
  - **Testing**
    - Add a hidden debug action on the account screen: `Sentry.nativeCrash()` and `throw new Error("sentry test")` buttons behind a dev flag
    - Verify events appear in Sentry from a TestFlight/Internal Testing build (not just dev client)

---

# Larger Features

## Admin Portal (Web)

- [ ] Internal admin dashboard for platform-wide visibility and analytics
  - Standalone web app behind admin auth (currently only the `admin-reports` edge function exists)
  - User & organisation management — list, search, view detail, deactivate
  - Report browser — search/filter all reports across all users, drill into detail
  - Platform analytics: report volume over time, active users, reports per org, avg generation time, token spend
  - Per-organisation breakdowns: report counts, project counts, active members
  - Data export (CSV / PDF) for reports and analytics
  - Moderation tools: flag/review low-quality reports, view generation logs

## Web App

- [ ] User-facing web application (scope TBD, likely complementary to mobile)
  - Tech decision: Next.js / Vite React — currently a bare Vite scaffold exists in `apps/admin`
  - Likely features unique to web:
    - Data analytics dashboards (charts, tables, filters) for a user's own projects & reports
    - Bulk report browsing / search / export
    - PDF report generation and download
    - Project settings and team management UI
  - Likely overlap with mobile:
    - View reports (read-only, richer layout on desktop)
    - Project list and detail
    - Account / profile settings
  - Design principle: web is the "desk" companion — analysis, review, export; mobile is the "field" tool — voice capture, quick edits

## Organisations & Team Collaboration

- [ ] Multi-user organisations with shared projects
  - `organisations` table (id, name, created_at) and `organisation_members` (org_id, user_id, role: owner/admin/member/viewer)
  - Link projects to an organisation rather than (or in addition to) a single owner
  - RLS policies: members see all org projects; role-based write access
  - Invite flow: admin invites by phone/email, invitee joins org on signup or from account screen
  - Report sign-off / approval workflow:
    - Member submits report → PM reviews → PM approves or requests changes
    - `report_approvals` table (report_id, approver_id, status: pending/approved/rejected, comment, created_at)
    - Notifications on status change
  - Shared activity feed scoped to the organisation

## Cost & Financial Tracking

- [ ] Track project expenditure across labour, equipment, and materials
  - `cost_entries` table (id, project_id, report_id nullable, category: labour/equipment_rental/equipment_purchase/materials/other, description, amount, currency, entry_date, created_at)
  - Capture costs during report generation — LLM already extracts manpower counts, equipment hours, material quantities; prompt can be extended to estimate costs when unit prices are provided
  - Manual cost entry screen in mobile app (quick-add from project detail)
  - Per-project cost summary: total spend, breakdown by category, spend over time chart
  - Budget tracking: optional budget field on projects, progress bar vs actuals
  - Web app: richer cost analytics, export to CSV/Excel

## Photo & Document Attachments

- [ ] Attach photos and files to reports and activities
  - Supabase Storage bucket for report media
  - Camera / gallery picker in the mobile generate screen
  - Associate images with specific activities or issues via metadata
  - Display in report view; include in PDF exports
  - Storage quotas per plan tier

## Offline Mode & Sync

- [ ] Full offline support for field use with poor connectivity
  - Local SQLite (via expo-sqlite or WatermelonDB) mirroring key tables
  - Queue report generation requests when offline; sync when back online
  - Conflict resolution strategy for concurrent edits (last-write-wins or manual merge)
  - Offline indicator in the app UI

## PDF / Export

- [x] Generate PDF reports from structured report data
  - ~~Client-side PDF rendering~~ — `export-report-pdf.ts` via `expo-print`
  - ~~Export as PDF or share~~ — share via `expo-sharing`, save to device
- [ ] PDF enhancements
  - Branded template with company logo
  - Photo attachments in PDF
  - Server-side rendering for consistency
  - Batch export for a date range or project

---

# Production Readiness

> Work required to run this app for real users at scale. Ordered roughly by risk of hitting you first.

## Compliance & Legal

- [ ] **SOC 2 Type II** — see [docs/features/03-soc2-compliance-gap-analysis.md](docs/features/03-soc2-compliance-gap-analysis.md)
  - Replace `AsyncStorage` session token with `expo-secure-store` (Keychain/Keystore) — highest priority gap
  - Pick an auditor + compliance platform (Vanta / Drata / Secureframe)
  - Define policies: information security, access control, incident response, change management, vendor management, BCP/DR
  - Employee onboarding/offboarding checklist, background checks, security awareness training
  - Annual risk assessment and penetration test
  - Evidence collection automation (GitHub, AWS/Supabase, Sentry, Okta/Google Workspace)
  - 3-month observation window minimum before Type II report

- [ ] **GDPR / CCPA / privacy rights**
  - Publish Privacy Policy + Terms of Service + link from signup screen; track acceptance with timestamp
  - Right to access: user-triggered data export (all profiles/projects/reports/notes/token_usage as JSON + PDFs)
  - Right to erasure: self-serve account deletion that cascades across Supabase, Sentry, analytics, Stripe, LLM provider logs
  - Data Processing Agreements (DPAs) signed with each sub-processor: Supabase, OpenAI, Anthropic, Google AI, Moonshot, Twilio, Sentry, Expo/EAS, Vercel
  - Publish a sub-processor list on the marketing site
  - Cookie / tracking consent banner (web app) — no analytics firing before consent
  - Data retention policy: auto-purge soft-deleted rows after N days; document retention periods per table
  - Regional data residency story (EU users → EU Supabase project if required)

- [ ] **AI-specific policies**
  - Disclose in ToS which LLM providers are used and that prompts/notes are sent to them
  - Opt-out flag to exclude a user's data from any future training/eval set
  - PII redaction pass before sending notes to the LLM (phone numbers, names of non-consenting parties)
  - AI output disclaimer on generated reports ("AI-generated, verify before use")

## Security Hardening

- [ ] **Secrets & credentials**
  - Rotate the Supabase anon key and all LLM provider keys quarterly; document rotation in a runbook
  - Move any remaining secrets out of `.env` files into a proper secret manager (Doppler / 1Password / AWS Secrets Manager)
  - Pre-commit hook or CI check (gitleaks / trufflehog) to block accidental secret commits
  - Audit git history for any historically-committed secrets and revoke/rotate

- [ ] **Edge function security**
  - Rate limiting per user ID on `generate-report`, `generate-report-playground`, `admin-reports` (token bucket in Supabase or Upstash Redis)
  - Request size limits (notes array, body size) to prevent abuse
  - Prompt-injection defence: treat note content as untrusted, system prompt hardening, output validation via Zod
  - CORS allow-list tightened to known domains (currently may be `*`)
  - IP-based abuse detection / Cloudflare in front of edge functions

- [ ] **Mobile app hardening**
  - SSL certificate pinning for the Supabase domain (react-native-ssl-pinning)
  - Jailbreak / root detection — warn and/or block sensitive actions
  - Obfuscate release builds (Hermes bytecode helps; consider JS obfuscator for critical logic)
  - Prevent screenshots on sensitive screens (`FLAG_SECURE` on Android)
  - Biometric unlock option for app launch (`expo-local-authentication`)
  - Clear sensitive clipboard after N seconds

- [ ] **Dependency & supply chain**
  - Enable Dependabot / Renovate for all `package.json` files
  - `pnpm audit` or Snyk scan in CI; fail on high/critical CVEs
  - SAST in CI: Semgrep + CodeQL
  - Lockfile hash verification in CI
  - Annual third-party pen test before renewing SOC 2

- [ ] **MFA & account security**
  - TOTP 2FA as an optional second factor on top of phone OTP
  - Device/session list on account screen with "revoke" per device
  - Email notification on new device login
  - Account lockout after N failed OTP attempts (currently relies on Twilio/Supabase defaults)

## Reliability & Operations

- [ ] **Monitoring & alerting**
  - Sentry (see separate TODO above) for crashes/errors
  - Edge function metrics dashboard: p50/p95/p99 latency, error rate, invocations per user (Logflare → Grafana or Datadog)
  - Uptime monitoring (Better Uptime / Pingdom) hitting a `/health` edge function every minute
  - Public status page (instatus.com / status.io) for users
  - PagerDuty / Opsgenie on-call rotation with clear severity definitions

- [ ] **Logging**
  - Structured JSON logs from all edge functions (request_id, user_id, duration_ms, provider, tokens)
  - Ship logs to Axiom / Logtail / Datadog with 30-90 day retention
  - Never log PII or prompt contents at INFO level; DEBUG-only and scrubbed

> Expanded below under **Observability** — full logging, crash analysis, and tracing stack.

- [ ] **Backups & disaster recovery**
  - Supabase Point-In-Time Recovery enabled (paid plan requirement)
  - Monthly restore drill: restore a backup to a staging project and verify integrity
  - Documented RTO (recovery time objective) and RPO (recovery point objective)
  - Export critical tables to an external S3 bucket weekly as a second-line backup

- [ ] **CI/CD & release engineering**
  - Branch protection on `main` / `dev`: required reviews, passing CI, linear history
  - CI pipeline: lint + typecheck + vitest + RLS tests + deno test + maestro cloud smoke
  - EAS build + submit automated from tags (not manual `vercel --prod`)
  - Staging environment (separate Supabase project) with production-like data
  - Preview deploys for web / playground on every PR
  - Database migration review process; `supabase db diff` in PR description

- [ ] **Release management**
  - Semver for mobile releases (`expo.version`) and build numbers
  - OTA update policy: fix-only on `expo-updates`; require full native build for JS engine or native module changes
  - Minimum-supported-version gate: force-upgrade screen if the app is too old for the current backend contract
  - Changelog / release notes for each version
  - Staged rollout on App Store (7-day phased release) and Play Store

- [ ] **Feature flags, A/B testing & dev settings**

  > Design doc: `docs/features/02-feature-flags.md`

  **Phase 1 — Foundation**
  - [ ] Migration: `feature_flags` table + `experiment_assignments` table + `get_flags` RPC + `evaluate_flag_rule` helper
  - [ ] Seed initial flags: `dev_phone_auth`, `dev_ai_provider_picker`, `dev_debug_panel`, `dev_seed_accounts`, `ai_provider_kill_switch`, `enable_quota_enforcement`
  - [ ] `supabase/functions/_shared/flags.ts` — server-side flag reader with 60s cache
  - [ ] `apps/mobile/lib/flags.tsx` — `FlagProvider`, `useFlag`, `useBooleanFlag`, `useStringFlag`, `useJsonFlag`, `FlagOverrideProvider`
  - [ ] Wire `<FlagProvider>` into `app/_layout.tsx` (after `<AuthProvider>`)
  - [ ] Enable Supabase Realtime on `feature_flags` for instant kill-switch propagation
  - [ ] Unit tests for flag evaluation + `FlagOverrideProvider`

  **Phase 2 — Migrate Existing Flags**
  - [ ] Replace `isDevPhoneAuthEnabled` with `useBooleanFlag("dev_phone_auth")`
  - [ ] Replace AI provider picker `__DEV__` guard with `useBooleanFlag("dev_ai_provider_picker")`
  - [ ] Replace `__DEV__` guards in generate screen with `useBooleanFlag("dev_debug_panel")`
  - [ ] Add `ai_provider_kill_switch` check in `generate-report` edge function
  - [ ] Remove `EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH` env var after transition
  - [ ] Update Maestro / local seed data

  **Phase 3 — Quota Enforcement Flag** (with Payment System)
  - [ ] Add `enable_quota_enforcement` flag (enabled=false by default)
  - [ ] Use `getFlag("enable_quota_enforcement")` in `generate-report` instead of env var
  - [ ] Toggle on per-environment via Supabase dashboard

  **Phase 4 — Server-Driven Config**
  - [ ] `ai_default_provider` (string flag) — runtime AI provider switching without redeploy
  - [ ] `ai_prompt_version` (string flag) — select prompt variant without release
  - [ ] `ai_max_output_tokens` (number flag) — tune generation limits remotely
  - [ ] `rate_limit_reports_per_hour` (number flag) — adjustable rate limits

  **Phase 5 — A/B Testing**
  - [ ] Implement `assign_experiment` Postgres RPC (deterministic user hashing)
  - [ ] Add `useExperiment` hook to client SDK
  - [ ] First experiment: onboarding flow A/B test
  - [ ] Analysis queries for experiment conversion rates

  **Phase 6 — PostHog Migration** (when analytics needed)
  - [ ] Integrate `posthog-react-native` SDK
  - [ ] Swap `FlagProvider` backend to PostHog, keep same hook API
  - [ ] Migrate experiment tracking to PostHog experiments

## Growth & Product

- [ ] **Analytics**
  - Product analytics (PostHog / Amplitude / Mixpanel) — funnels: signup → first report → retained
  - Key events: report_generated, report_shared, pdf_exported, project_created, trial_converted
  - Dashboards: WAU/MAU, DAU/MAU ratio, retention cohorts, feature adoption
  - Respect the tracking consent banner from the GDPR section

- [ ] **Push notifications**
  - Expo push notifications infrastructure
  - Use cases: teammate commented on your report, report approval requested/granted, weekly digest, draft-report reminder
  - Per-category user preferences on account screen
  - Quiet hours / timezone-aware delivery

- [ ] **Transactional email**
  - Provider: Resend / Postmark / SendGrid
  - Templates: welcome, weekly digest, password/phone change, account deletion confirmation, receipt
  - Branded From: address + SPF/DKIM/DMARC set up on the sending domain
  - One-click unsubscribe for non-transactional mail

- [ ] **Billing & subscriptions**
  - Payment provider decision: Stripe (web) + RevenueCat (mobile IAP) for StoreKit/Play Billing wrapping
  - Plans table in DB mapped to Stripe/RC products; per-plan feature limits enforced at edge-function layer
  - Trial period, upgrade/downgrade flow, cancellation flow
  - Receipts, invoices, VAT/GST handling per region
  - Dunning: retry failed payments, in-app banner on past-due
  - Webhook handler (Stripe → Supabase) idempotent and signature-verified
  - Enforce per-plan token quotas (ties into existing token_usage tracking)

- [ ] **Onboarding**
  - Welcome screens explaining core flow (first-time only)
  - Seed a sample project + report so the empty state isn't empty
  - Inline coach-marks on generate screen (first voice capture, first save)
  - Empty-state CTAs everywhere (projects list, reports list)

- [ ] **In-app support & feedback**
  - Intercom / Crisp / Pylon in-app chat, or at minimum a "Contact Support" mailto with diagnostic metadata
  - Shake-to-report-bug — captures screenshot + last 100 log lines + Sentry event id
  - Public help centre / FAQ (Notion / GitBook / HelpScout)
  - Review prompts via `expo-store-review` after N successful reports

- [ ] **Accessibility (a11y)**
  - WCAG 2.1 AA audit of every screen
  - VoiceOver / TalkBack labels on all interactive elements (partially done — extend)
  - Dynamic Type / font scaling support
  - Colour-contrast pass against `#f8f6f1` / `#1a1a2e` palette
  - Minimum tap target size (44×44 iOS / 48×48 Android)
  - `reduce motion` honoured for animations

- [ ] **Internationalisation (i18n)**
  - Externalise all UI strings (react-i18next / lingui / expo-localization)
  - Start with English + Japanese (target market) + one CJK / RTL pair to prove the infrastructure
  - Locale-aware dates, numbers, currency
  - AI output locale matching the UI locale

- [ ] **Marketing site & app store presence**
  - Landing page (`apps/web` or separate) with pricing, features, testimonials
  - App Store + Play Store optimisation: screenshots per device class, keyword research, localised listings
  - Privacy Nutrition Labels (Apple) + Data Safety form (Google) — kept in sync with actual data collection
  - Open Graph / Twitter card metadata for shared links
  - Deep linking + Universal Links / App Links for shared reports

- [ ] **Documentation**
  - User-facing: help centre articles for each feature
  - Developer-facing: `docs/` already strong; add an API reference for edge functions
  - Internal runbooks: on-call guide, incident response, data deletion, key rotation

## Data & AI

- [ ] **AI quality & safety**
  - Eval harness: curated test notes → expected report shape, run on every prompt/model change
  - Regression suite for prompt changes
  - Content safety filter on outputs (OpenAI moderation or equivalent)
  - Hallucination detection: cross-check cited quantities against raw notes
  - Human-in-the-loop flagging: users can report bad outputs → stored for review

- [ ] **Cost control**
  - Per-user/per-plan token caps (ties into existing `token_usage` tracking)
  - Alerts when monthly spend exceeds $N
  - Model tiering: cheaper model for drafts, premium for final generation
  - Prompt caching (Anthropic) / batch API where available

## User Trust

- [ ] **Transparency features**
  - Audit log visible to the user: "who accessed what, when" for their org
  - Data-export button on account screen
  - Self-serve account deletion button (hard-deletes after 30-day grace)
  - Visible version + build number on account screen (aids support)
  - "What's new" modal on first launch after an update

## Observability — Logging, Crashes, Tracing

> The full story for "what happened to this user at 14:32?" — unified IDs across client → edge function → database → LLM provider.

- [ ] **Log schema & correlation**
  - Define a shared JSON log schema across mobile + edge functions + web:
    - `timestamp`, `level` (debug/info/warn/error), `event`, `request_id`, `user_id`, `project_id`, `report_id`, `provider`, `model`, `duration_ms`, `tokens_in`, `tokens_out`, `status_code`, `error_code`, `release`, `platform`
  - Generate a `request_id` (UUID) on the mobile client per user action; pass via `X-Request-ID` header to all edge function calls
  - Echo the `request_id` into Sentry breadcrumbs, edge function logs, and database `report_generation_log` — one ID links everything
  - Include `release` (`${version}+${buildNumber}`) and `environment` (`dev` / `preview` / `prod`) on every event

- [ ] **Client-side logging (mobile)**
  - Replace scattered `console.log` / `console.error` with a thin wrapper (`lib/log.ts`) that:
    - Routes DEBUG to dev console only
    - Sends INFO/WARN/ERROR as Sentry breadcrumbs
    - Forwards ERROR to `Sentry.captureException` with context
  - Log key user actions as breadcrumbs: `auth.signin`, `project.create`, `report.generate.start`, `report.generate.success`, `report.generate.error`, `pdf.export`, `speech.recognition.error`
  - Ring buffer of last 200 log lines kept in memory → attached to bug reports (shake-to-report)
  - Optional: persist logs to AsyncStorage for N hours so a user can email them when offline

- [ ] **Edge function logging**
  - Replace `console.log` in `supabase/functions/**` with a structured logger (`_shared/log.ts`) emitting JSON
  - Supabase Functions auto-stream to Logflare → export to Axiom / Logtail / Datadog / BetterStack
  - Scrub PII before logging: phone numbers, auth tokens, full prompt/notes content (log byte length + hash only at INFO level)
  - Log every LLM call with `provider`, `model`, `duration_ms`, `tokens_in`, `tokens_out`, `finish_reason`, `http_status` — feeds both debugging and cost dashboards
  - Log every Zod parse failure with the schema path (not the full value) for prompt-regression detection
  - Enforce per-level sampling: INFO at 100%, DEBUG at 10% in prod

- [ ] **Database logging (Supabase / Postgres)**
  - Enable the `pg_stat_statements` extension for slow-query analysis
  - `log_min_duration_statement = 500ms` on Postgres to catch slow queries
  - Ship Supabase logs (auth, database, realtime, storage) to the same log store as edge functions
  - Audit trigger on sensitive tables (`profiles`, `project_members`) → append-only `audit_log` table with `(table_name, row_id, actor_user_id, action, old_row, new_row, changed_at)`
  - Use `pgaudit` for SOC 2 evidence if required

- [ ] **Crash analysis pipeline**
  - Sentry (see Sentry TODO) as the primary crash aggregator
  - Symbolication verified end-to-end for iOS (dSYM), Android (ProGuard/R8), and Hermes (JS source maps) — unsymbolicated stacks must fail CI
  - **Alert rules**:
    - Any new unresolved issue → Slack `#alerts-mobile`
    - Regression on a resolved issue → PagerDuty
    - Crash-free-users drops below 99% in a 1-hour window → PagerDuty
    - Error spike: >10x baseline error rate in 5 min → Slack
  - **Triage workflow**:
    - Daily 10-minute Sentry review during standup
    - Each issue assigned an owner + priority (P0 crash, P1 error, P2 warning)
    - Link Sentry issue → GitHub issue automatically
  - **Session replay** (optional, via Sentry Replays) — redact PII, sample at 10% of error sessions
  - **Native crash-only tools for belt-and-braces coverage**:
    - iOS: App Store Connect → Xcode Organizer crashes + MetricKit diagnostics
    - Android: Play Console → Android Vitals (crashes + ANRs + slow startup)
    - Reconcile weekly — Sentry should match platform numbers ±10%; mismatch means dSYM/ProGuard upload is broken

- [ ] **Performance tracing**
  - Distributed tracing across mobile → edge function → DB → LLM provider
  - Sentry Performance (transactions + spans) or OpenTelemetry → Honeycomb / Grafana Tempo
  - Critical transactions to instrument:
    - `report.generate` — break down into: notes_upload, LLM call (span per retry), zod_parse, db_write
    - `auth.signin` — OTP send + verify + profile fetch
    - `pdf.export` — html_render + expo-print + share_sheet
  - Sample rate: 10-20% in prod, 100% for errored transactions
  - Budget / SLO: p95 report generation < 30s, p95 screen transition < 500ms

- [ ] **Dashboards**
  - **Health dashboard** (Grafana / Datadog / Axiom): error rate, p50/p95/p99 latency, crash-free sessions, active users, LLM error rate per provider
  - **Business dashboard** (Posthog / Metabase on Supabase read-replica): DAU/MAU, report generation funnel, conversion, retention cohorts
  - **Cost dashboard**: tokens per day per provider per user, edge function invocations, Supabase egress, storage
  - **LLM quality dashboard**: Zod parse failure rate, finish_reason distribution, retry rate per model

- [ ] **Log-driven alerts**
  - Error log rate > threshold → Slack
  - Specific event patterns → alert: `report.generate.failed.rate > 5%`, `auth.otp.verify.failed.rate > 10%`
  - Cost anomaly: single user > 10x their 7-day average token usage → Slack (abuse detection)
  - Silent failures: expected event count drops to zero (e.g., no `report.generate.success` in 30 min during business hours)

- [ ] **Retention & compliance**
  - Default 30-day log retention; 1-year retention for audit logs (SOC 2 requirement)
  - Scrub or hash PII at ingest (Vector / cribl / log processor rule)
  - Access control: only engineering + on-call can read raw logs; separate redacted dashboard for everyone else
  - Document log schema + PII handling in `docs/observability.md`

- [ ] **Debugging workflows / runbooks**
  - "User reports bug X" runbook: get request_id or user_id → query logs → pull Sentry session → link trace → identify root cause
  - Replay a failed report generation from stored notes (ties into the `notes` persistence feature already shipped)
  - Dead-letter queue for failed LLM calls so they can be replayed after fixing a prompt/schema issue
