# Pricing Reference

A consolidated view of all third-party services currently used by Harpa Pro plus a shortlist of services that are likely to be added as the product grows. Use this doc as a quick reference when budgeting, swapping providers, or sizing a new environment.

> Prices quoted in USD and pulled from each vendor's public pricing page. They change frequently — always double-check the vendor site before committing. Last reviewed: **April 2026**.

---

## 1. Currently Used

### 1.1 Supabase (backend: Postgres, Auth, Storage, Edge Functions)

Single platform covers our DB, phone OTP auth, and Deno edge functions (`generate-report`, `admin-reports`).

| Plan | Monthly | Included | Overage / Notes |
|------|---------|----------|-----------------|
| Free | $0 | 500 MB DB, 1 GB storage, 2 GB egress, 50k MAU, 500k edge function invocations, 2 projects, paused after 1 week inactivity | Dev / PR previews |
| Pro | $25 / org | 8 GB DB, 100 GB storage, 250 GB egress, 100k MAU, 2M edge function invocations, daily backups (7 days), no pausing | $0.0125 / GB DB, $0.021 / GB storage, $0.09 / GB egress, $0.00325 / 1k MAU, $2 / 1M edge invocations |
| Team | $599 / org | Pro + SOC 2, SSO, 14-day PITR, priority support | Usage overages same as Pro |
| Enterprise | Custom | HIPAA, custom SLAs, dedicated support | Contact sales |

**Phone OTP (Twilio/MessageBird, billed through Supabase):** SMS costs are passed through at Twilio rates — roughly **$0.0075–$0.05 per SMS** depending on destination country (US ~$0.008, UK ~$0.04, Japan ~$0.07). Budget a per-signup cost in every region we launch.

### 1.2 Vercel (web marketing site)

Hosts `apps/web` (Vite + React).

| Plan | Monthly | Included | Overage |
|------|---------|----------|---------|
| Hobby | $0 | 100 GB bandwidth, 100 GB-hrs serverless, non-commercial only | Hard limits |
| Pro | $20 / member | 1 TB bandwidth, 1000 GB-hrs, commercial use, analytics add-on | $0.15 / GB bandwidth, $0.18 / GB-hr functions |
| Enterprise | Custom | SSO, SAML, 99.99% SLA, DDoS, dedicated support | Contact sales |

Our marketing site is static + a handful of assets — Hobby or a single Pro seat is plenty.

### 1.3 Expo / EAS (mobile builds + OTA updates)

Drives `apps/mobile` build pipeline, submissions, and OTA updates (`eas-update.yml`).

| Plan | Monthly | Included | Overage |
|------|---------|----------|---------|
| Free | $0 | 30 builds / month (shared queue, slow), 1k MAU for EAS Update | Cannot build priority |
| On-Demand | Pay-as-you-go | — | $1 / medium build, $2 / large build, $0.005 / MAU for Updates |
| Production | $99 | 1 concurrency priority build, unlimited medium builds, 50k EAS Update MAU | $2 / large build, $0.005 / MAU beyond 50k |
| Enterprise | $999+ | Multiple concurrencies, unlimited MAU, SSO, SLA | Contact sales |

Typical cost today: **$99/mo Production** once we have steady TestFlight / Play Store releases. Builds: ~1 iOS + 1 Android per feature week.

### 1.4 Apple Developer Program

Required to publish to the App Store and TestFlight.

| Item | Price |
|------|-------|
| Individual / Organization | **$99 / year** |
| Enterprise (in-house distribution only) | $299 / year |
| App Store commission (consumer IAP) | 15% (small business / year 2 subs) or 30% (standard) |

### 1.5 Google Play Developer

Required for Android distribution.

| Item | Price |
|------|-------|
| One-time account fee | **$25** |
| Play Store commission | 15% (first $1M / year) or 30% (above) |

### 1.6 GitHub Actions (CI)

Workflows in `.github/workflows/` (generate-report tests, mobile tests, EAS update).

| Plan | Monthly | Included | Overage |
|------|---------|----------|---------|
| Free (public repo) | $0 | Unlimited minutes | — |
| Free (private repo) | $0 | 2,000 Linux min, 500 MB storage | $0.008 / Linux min, $0.016 / macOS min |
| Team | $4 / user | 3,000 Linux min, 2 GB storage | Same overage |
| Enterprise | $21 / user | 50,000 Linux min, 50 GB storage | Same overage |

macOS minutes (needed if we move iOS E2E into CI) are **10×** the Linux rate — budget carefully.

### 1.7 AI providers (edge function `generate-report`)

Prices per **1M tokens** (input / output). Provider selected via `AI_PROVIDER` env var.

| Provider | Model | Input | Output | Context | Notes |
|---------|-------|------:|-------:|--------:|-------|
| **Moonshot (Kimi)** | `kimi-k2-0711-preview` | $0.55 | $2.19 | 128k | Default for CI — cheap, weaker instruction-following |
| Moonshot (legacy) | moonshot-v1-128k | $0.14 | $0.28 | 128k | Cheapest, lower quality |
| **OpenAI** | `gpt-4o-mini` | $0.15 | $0.60 | 128k | Best price/quality ratio |
| OpenAI | `gpt-4o` | $2.50 | $10.00 | 128k | Premium reasoning |
| OpenAI | `gpt-4.1-mini` | $0.40 | $1.60 | 1M | Larger context successor |
| **Anthropic** | `claude-sonnet-4` | $3.00 | $15.00 | 200k | Strongest instruction-following; **prompt caching** cuts ~90% of system-prompt cost on repeat calls |
| Anthropic | `claude-haiku-4` | $0.25 | $1.25 | 200k | Cheap Anthropic tier |
| **Google** | `gemini-2.0-flash` | $0.10 | $0.40 | 1M | Fastest, huge context |
| Google | `gemini-2.0-flash-lite` | $0.075 | $0.30 | 1M | Cheapest |
| DeepSeek | `deepseek-v3` | $0.27 | $1.10 | 64k | Chinese hosting |
| DeepSeek | `deepseek-r1` | $0.55 | $2.19 | 64k | Reasoning model |
| Alibaba Qwen | `qwen-max` | $1.60 | $6.40 | 32k | — |
| Alibaba Qwen | `qwen-plus` | $0.40 | $1.20 | 32k | — |
| Alibaba Qwen | `qwen-turbo` | $0.05 | $0.20 | 8k | Ultra-cheap |
| Zhipu AI | `GLM-4` | $1.40 | $1.40 | 128k | — |
| Baichuan | `baichuan-4` | $1.40 | $1.40 | 32k | — |
| 01.AI | `yi-large` | $0.40 | $0.40 | 32k | — |

**Typical report cost** (from `docs/ai-providers.md`):

| Scenario | Tokens in | Tokens out | gpt-4o-mini | claude-sonnet-4 (cached) | gemini-2.0-flash | kimi-k2 |
|----------|----------:|-----------:|------------:|------------------------:|-----------------:|--------:|
| 9 notes, quiet day | ~1,800 | ~1,500 | ~$0.001 | ~$0.023 | ~$0.001 | ~$0.004 |
| 50 notes, commercial build | ~3,000 | ~3,500 | ~$0.003 | ~$0.053 | ~$0.002 | ~$0.009 |

At **1,000 reports/month on gpt-4o-mini** we're looking at roughly **$2–$4/mo** in AI costs. At 10× scale with Claude Sonnet, expect $200–$500/mo — the caching + delta-notes optimisations matter.

---

## 2. Cost Summary (current baseline)

Assuming low-traffic, early-paying-customer scale.

| Service | Plan | Monthly |
|---------|------|--------:|
| Supabase | Pro | $25 |
| Vercel | Hobby (or Pro seat) | $0–$20 |
| EAS | Production | $99 |
| GitHub Actions | Free (within limits) | $0 |
| AI providers | gpt-4o-mini primary | ~$5 |
| Apple Developer | — | $8.25 (annualised) |
| Google Play | — | ~$0.50 (one-off amortised) |
| Phone OTP (Twilio, ~1k signups) | pass-through | ~$10 |
| **Total** | | **~$150 / mo** |

---

## 3. Services We're Likely To Add

Not wired up yet, but worth knowing before we turn them on.

### 3.1 Error monitoring & observability

| Service | Free tier | Paid entry | Notes |
|---------|-----------|-----------:|-------|
| **Sentry** | 5k errors, 10k traces / mo, 1 user | $26 / mo Team (50k errors) | First-class Expo + Supabase Edge SDKs |
| Bugsnag | 7.5k events, 1 user | $49 / mo | Good RN support |
| LogRocket | 1k sessions / mo | $69 / mo | Session replay; mobile is pricier |
| Datadog (APM + logs) | — | ~$31 / host + $0.10 / GB logs | Heavy but unified |
| Better Stack | 1k logs, 3 monitors | $10 / mo | Cheap status pages + log tailing |

### 3.2 Product analytics

| Service | Free tier | Paid entry | Notes |
|---------|-----------|-----------:|-------|
| **PostHog (Cloud)** | 1M events, 5k session recordings | $0.00005 / event after | Self-hostable too; great RN SDK |
| Mixpanel | 20M monthly events | $28 / mo Growth | Strong funnels |
| Amplitude | 50k MTUs | $49 / mo | Enterprise-friendly |
| RevenueCat (IAP analytics) | $10k MTR free | 1% of tracked revenue | Essential if we add subscriptions |

### 3.3 Transactional messaging

| Service | Free tier | Paid entry | Notes |
|---------|-----------|-----------:|-------|
| Twilio SMS | — | $0.0079 / SMS (US) | Supabase uses this under the hood |
| Twilio Verify (OTP) | — | $0.05 / verification | Bundled SMS + fraud protection |
| **Resend** (email) | 100 emails / day, 3k / mo | $20 / mo (50k emails) | Best DX for transactional email |
| Postmark | 100 test / mo | $15 / mo (10k emails) | Reliable transactional |
| SendGrid | 100 emails / day | $19.95 / mo (50k) | Incumbent |
| OneSignal (push) | 10k subs | $9 / mo for 10k+ | Easy Expo push fallback |
| Expo Push | Free | Free | Already available via Expo |

### 3.4 Speech-to-text (for voice notes)

Relevant because `useSpeechToText` currently uses on-device STT; we may want cloud fallback.

| Service | Price | Notes |
|---------|------:|-------|
| OpenAI Whisper API | $0.006 / min | Good multilingual |
| Deepgram Nova-2 | $0.0043 / min streaming | Fastest, best for realtime |
| Google Speech-to-Text | $0.016 / min (standard) | Rock-solid multilingual |
| AssemblyAI | $0.37 / hour ≈ $0.006 / min | Good speaker diarisation |
| ElevenLabs Scribe | $0.40 / hour | Newer, premium quality |

### 3.5 Image / file storage & CDN

Today we use Supabase Storage. Alternatives if we outgrow it:

| Service | Price | Notes |
|---------|------:|-------|
| Cloudflare R2 | $0.015 / GB storage, **$0 egress** | Best for image-heavy reports |
| AWS S3 | $0.023 / GB storage, $0.09 / GB egress | Incumbent |
| Backblaze B2 | $0.006 / GB storage, $0.01 / GB egress | Cheapest cold storage |
| Cloudinary | $99 / mo Plus | If we need transformations |
| ImageKit | $0 up to 20 GB bw, then $49 / mo | Cheap image CDN |

### 3.6 Maps & geolocation

| Service | Free tier | Paid | Notes |
|---------|-----------|-----:|-------|
| Mapbox | 50k map loads / mo | $0.60 / 1k after | Best RN SDK |
| Google Maps (Mobile SDK) | $200 credit / mo | $7 / 1k loads after | Geocoding $5 / 1k |
| Apple MapKit | Free on iOS | — | iOS-only, no Android |

### 3.7 Weather (already shown in `WeatherStrip`)

| Service | Free tier | Paid | Notes |
|---------|-----------|-----:|-------|
| OpenWeather | 1k calls / day | $40 / mo Developer | Simplest |
| WeatherAPI.com | 1M calls / mo | $4 / mo Pro | Cheapest paid |
| Tomorrow.io | 500 calls / day | $99 / mo | Best forecasts |
| Open-Meteo | **Free, unlimited** (non-commercial) | Commercial: €29 / mo | Zero-key quickstart |

### 3.8 PDF generation (report exports)

`export-report-pdf.ts` currently renders locally. If we move server-side:

| Service | Price | Notes |
|---------|------:|-------|
| DocRaptor | $15 / mo (125 docs) | Prince-based, handles CSS print well |
| PDFShift | $9 / mo (500 conversions) | Simple REST API |
| Browserless | $50 / mo | Headless Chrome as a service |
| Self-hosted Puppeteer on Supabase Edge | Included in edge func minutes | Deno lacks Chromium — would need Fly.io / Cloud Run |

### 3.9 App store search & review monitoring

| Service | Price | Notes |
|---------|------:|-------|
| AppFollow | $23 / mo | Review monitoring |
| Sensor Tower | Custom | ASO + competitor data |
| Data.ai (App Annie) | Custom | — |

### 3.10 Secret management

| Service | Free | Paid | Notes |
|---------|------|-----:|-------|
| Doppler | 5 users, 3 envs | $18 / user | Great DX |
| 1Password Secrets Automation | — | $19.95 / mo | If team already uses 1Password |
| AWS Secrets Manager | — | $0.40 / secret / mo | Incumbent |

### 3.11 Feature flags & remote config

| Service | Free | Paid | Notes |
|---------|------|-----:|-------|
| PostHog Feature Flags | Included in PostHog | — | Kills two birds |
| LaunchDarkly | 14-day trial | ~$10 / MAU | Enterprise |
| Statsig | 1M events / mo | Usage-based | Free-forever analytics too |
| Expo Updates channels | Free | Included in EAS | Works for simple toggles |

### 3.12 Billing (if/when we charge money)

| Service | Fee | Notes |
|---------|----:|-------|
| Stripe (web checkout) | 2.9% + $0.30 | Self-serve card + subscriptions |
| Apple IAP / Play Billing | 15–30% | Mandatory for in-app digital goods on mobile |
| RevenueCat | 1% of tracked revenue | Unifies IAP + Play + Stripe |
| Paddle | 5% + $0.50 | Merchant-of-record (handles tax) |

---

## 4. Cost Levers

When optimising spend, these have the biggest impact in our stack:

1. **AI prompt caching** — Anthropic system-prompt caching already saves ~90% on repeat calls. Keep it on, keep the system prompt stable.
2. **AI delta notes** — `generate-report` only sends new notes on updates. Don't regress this.
3. **Supabase egress** — Report images download over the app can dominate egress. Serve through a CDN (Cloudflare R2 / Supabase storage transforms) at scale.
4. **EAS builds** — iOS builds default to large. Use `resourceClass: medium` where possible; OTA updates for JS-only changes so we don't burn a full build per PR.
5. **GitHub Actions macOS minutes** — 10× the Linux rate. Keep E2E (Maestro) off CI until we really need it, or run on Linux Android only.
6. **Phone OTP** — destination-country SMS is the silent cost sink. Consider WhatsApp OTP (Twilio) in APAC / LATAM.
7. **Sentry / PostHog event volume** — both bill on events. Sample non-critical breadcrumbs / page-views before we cross the free tier.
