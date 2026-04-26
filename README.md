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

# Run the mobile app in Expo Go
pnpm dev:mobile

# Run the mobile app with the native development client
pnpm dev:mobile:client

# Run the playground app
pnpm dev:playground
```

### Mobile (Expo)

```bash
# Start Metro for Expo Go (Android/iOS Expo Go app)
pnpm --filter mobile start:go

# Start Metro for the native development client
pnpm --filter mobile start:dev-client

# iOS
pnpm --filter mobile ios

# Android
pnpm --filter mobile android
```

### Backend (local dev)

```bash
# Start the local backend stack
supabase start

# Apply migrations
supabase db push

# Generate TypeScript types
supabase gen types typescript --local > packages/types/backend.ts
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
├── supabase/
│   ├── migrations/      # SQL migration files
│   ├── functions/       # Edge Functions (Deno)
│   │   ├── generate-report/   # AI report generation
│   │   └── admin-reports/     # Admin report queries
│   ├── seed.sql         # Local dev seed data
│   └── config.toml      # Supabase local config
├── docs/                # Design specs & analysis docs
├── scripts/             # Utility scripts (seeding, etc.)
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
