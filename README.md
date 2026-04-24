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
| `apps/admin` | Internal admin dashboard | Vite, React |
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

# Run the admin app
pnpm dev:admin
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

## E2E Testing (Mobile)

Mobile E2E tests are written with [Maestro](https://maestro.mobile.dev/) and live in `apps/mobile/.maestro/`.

### Prerequisites

- **Java 17** — Maestro requires Java 17
- **Maestro CLI** — install with `curl -Ls "https://get.maestro.mobile.dev" | bash`
- The iOS simulator (or Android emulator) must be running with the app installed

### Setup

```bash
# Ensure Java 17 is active
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Start the app on the simulator (keep this running)
cd apps/mobile
npx expo run:ios        # or npx expo run:android
```

### Running tests

```bash
cd apps/mobile

# Run all flows
maestro test .maestro/

# Run a single flow
maestro test .maestro/login-demo-mike.yaml

# Run with Maestro Studio (interactive UI)
maestro studio
```

### Test flows

| Flow | Description |
|------|-------------|
| `login-demo-mike.yaml` | Log in as demo user Mike |
| `login-demo-sarah.yaml` | Log in as demo user Sarah |
| `login-phone-otp.yaml` | Log in via phone OTP |
| `sign-out.yaml` | Sign out of the app |
| `tab-navigation.yaml` | Verify tab bar navigation |
| `projects-list.yaml` | Browse the projects list |
| `navigate-to-new-project.yaml` | Navigate to the new project screen |
| `create-project.yaml` | Create a new project |
| `create-project-validation.yaml` | Validate project creation form |
| `profile-content.yaml` | Verify profile screen content |

Shared subflows in `.maestro/subflows/` are reused across tests (e.g. `ensure-logged-in-mike.yaml`, `ensure-logged-out.yaml`).

## Project Structure

```
/
├── apps/
│   ├── mobile/          # Expo app (field reporting)
│   └── admin/           # Internal admin dashboard (React + Vite)
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

**Admin (`apps/admin`):**

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Deployment

See [docs/02-deployment.md](docs/02-deployment.md) for full deployment instructions, CI/CD workflows, EAS build profiles, and environment variable setup.
