# Harpa Pro

AI-powered construction site reporting — generate daily, safety, and incident reports from the field.

## Apps

| App | Description | Stack |
|-----|-------------|-------|
| `apps/mobile` | Field reporting app for iOS & Android | Expo, React Native, NativeWind |
| `apps/web` | Web dashboard | Vite, React |
| `backend` | Backend services, functions, and data config | Supabase (PostgreSQL) |

## Getting Started

**Prerequisites:** Node.js 20+, pnpm 10+

```bash
# Install all dependencies
pnpm install

# Run the mobile app in Expo Go
pnpm dev:mobile

# Run the mobile app with the native development client
pnpm dev:mobile:client

# Run the web app
pnpm dev:web
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
│   ├── mobile/          # Expo app
│   └── web/             # Vite + React app
├── supabase/
│   ├── migrations/      # SQL migration files
│   ├── functions/       # Edge Functions (Deno)
│   ├── seed.sql         # Local dev seed data
│   └── config.toml      # Supabase local config
├── packages/            # Shared code (types, utils)
├── turbo.json
└── pnpm-workspace.yaml
```

## Environment Variables

Copy `.env.example` to `.env.local` in each app and fill in your backend credentials:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
