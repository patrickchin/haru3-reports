# Harpa Pro

[![Generate Report Tests](https://github.com/patrickchin/haru3-reports/actions/workflows/generate-report.yml/badge.svg?branch=dev)](https://github.com/patrickchin/haru3-reports/actions/workflows/generate-report.yml)
[![Generate Report Tests — Advanced](https://github.com/patrickchin/haru3-reports/actions/workflows/generate-report-advanced.yml/badge.svg?branch=dev)](https://github.com/patrickchin/haru3-reports/actions/workflows/generate-report-advanced.yml)
[![Mobile Tests](https://github.com/patrickchin/haru3-reports/actions/workflows/mobile-tests.yml/badge.svg?branch=dev)](https://github.com/patrickchin/haru3-reports/actions/workflows/mobile-tests.yml)
[![EAS Update (OTA)](https://github.com/patrickchin/haru3-reports/actions/workflows/eas-update.yml/badge.svg?branch=dev)](https://github.com/patrickchin/haru3-reports/actions/workflows/eas-update.yml)

AI-powered construction site reporting — generate daily, safety, and incident reports from the field.

## Apps

| App | Description | Stack |
|-----|-------------|-------|
| `apps/mobile` | Field reporting app for iOS & Android | Expo, React Native, NativeWind |
| `apps/playground` | Gated internal tool for testing report generation | Vite, React |
| `supabase/` | Backend: migrations, edge functions, seed data | Supabase (PostgreSQL, Deno) |

## Getting Started

**Prerequisites:** Node.js 20+, pnpm 10+

```bash
# Install all dependencies
pnpm install

# Run the mobile app (native dev client required — Expo Go is not supported)
pnpm dev:mobile

# Run the playground app
pnpm dev:playground
```

### Mobile (Expo)

The mobile app uses native modules (pinned `react-native-reanimated` /
`react-native-worklets`, etc.) that are
incompatible with Expo Go. You must use a development build.

```bash
# Build & install the native dev client on a simulator/device (run once,
# or whenever native deps change)
pnpm --filter mobile ios       # or: pnpm --filter mobile android

# Start Metro for the dev client
pnpm --filter mobile start
```

### Backend (local dev)

```bash
# Start the local backend stack
supabase start

# Apply migrations
supabase db push
```

### Deploy the report generator

```bash
# Deploy the edge function used by the mobile app
supabase functions deploy generate-report --no-verify-jwt
```

## Testing

See [docs/09-testing.md](docs/09-testing.md) for the full strategy across
unit (Vitest), edge-function (`deno test`), RLS integration, and Maestro
E2E layers.

Quick reference:

```bash
pnpm test                 # everything except E2E
pnpm test:mobile          # mobile Vitest
pnpm test:rls:local       # RLS against local supabase stack
pnpm test:rls:hosted      # RLS against hosted dev project

cd apps/mobile && maestro test .maestro/   # E2E (real LLM calls)
```

## Project Structure

```
/
├── apps/
│   ├── mobile/          # Expo app (field reporting)
│   └── playground/      # Gated internal report-generation playground (React + Vite)
├── packages/
│   └── report-core/     # Shared Zod schemas + helpers for GeneratedSiteReport
├── supabase/
│   ├── migrations/      # SQL migration files
│   ├── functions/       # Edge Functions (Deno)
│   │   ├── generate-report/             # AI report generation
│   │   ├── generate-report-playground/  # Gated playground variant
│   │   └── transcribe-audio/            # Voice-note transcription (Groq / Whisper / Deepgram)
│   ├── tests/           # RLS integration tests
│   ├── seed.sql         # Local dev seed data
│   └── config.toml      # Supabase local config
├── docs/                # Architecture, deployment, schema, testing, pricing
├── scripts/             # Utility scripts (seeding, EAS env sync, etc.)
├── turbo.json
└── pnpm-workspace.yaml
```

## Environment Variables

Copy `.env.example` to `.env.local` in each app and fill in your backend credentials:

**Mobile (`apps/mobile`):**

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

**Playground (`apps/playground`):**

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Deployment

See [docs/02-deployment.md](docs/02-deployment.md) for full deployment instructions, CI/CD workflows, EAS build profiles, and environment variable setup.
