# Harpa Pro

AI-powered construction site reporting — generate daily, safety, and incident reports from the field.

## Apps

| App | Description | Stack |
|-----|-------------|-------|
| `apps/mobile` | Field reporting app for iOS & Android | Expo, React Native, NativeWind |
| `apps/admin` | Admin dashboard (users, orgs, reports, analytics) | Vite, React, Recharts |
| `apps/web` | Marketing / landing page | Vite, React |
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

# Run the web app (marketing site)
pnpm dev:web

# Run the admin dashboard
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
│   ├── admin/           # Admin dashboard (React + Vite)
│   └── web/             # Marketing landing page (React + Vite)
├── supabase/
│   ├── migrations/      # SQL migration files
│   ├── functions/       # Edge Functions (Deno)
│   │   ├── generate-report/   # AI report generation
│   │   ├── admin-users/       # Admin user management
│   │   ├── admin-orgs/        # Admin org management
│   │   ├── admin-reports/     # Admin report queries
│   │   ├── admin-analytics/   # Admin analytics
│   │   └── admin-audit/       # Admin audit log
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

**Admin (`apps/admin`) and Web (`apps/web`):**

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Deployment

### Environments

| Environment | Supabase | Admin | Web | Mobile |
|-------------|----------|-------|-----|--------|
| **Local** | `supabase start` | `pnpm dev:admin` | `pnpm dev:web` | `pnpm dev:mobile` |
| **Staging** | Supabase project (dev) | Vercel preview | Vercel preview | EAS preview build |
| **Production** | Supabase project (prod) | Vercel prod | Vercel prod | EAS production build |

### 1. Supabase (backend)

Create two Supabase projects (staging + production), then link and deploy:

```bash
# Link to your staging project
supabase link --project-ref <staging-ref>

# Push database migrations
supabase db push

# Deploy all edge functions
supabase functions deploy generate-report --no-verify-jwt
supabase functions deploy admin-users admin-orgs admin-reports admin-analytics admin-audit

# Set edge function secrets
supabase secrets set \
  AI_PROVIDER=openai \
  OPENAI_API_KEY=sk-... \
  ANTHROPIC_API_KEY=sk-ant-... \
  GOOGLE_AI_API_KEY=AI... \
  MOONSHOT_API_KEY=sk-...
```

Automated via `.github/workflows/deploy-supabase.yml` on push to `main`.

### 2. Admin & Web (Vercel)

Both apps are standard Vite builds deployed to Vercel via `.github/workflows/deploy-web-apps.yml`.

Automated on push to `main` when files in `apps/admin/` or `apps/web/` change. Can also be triggered manually with a target environment.

### 3. Mobile (EAS Build + OTA Updates)

Automated via `.github/workflows/deploy-mobile.yml`:

- **Push to `main`** (files in `apps/mobile/`): publishes an **OTA update** to the `preview` channel — instant, no app store review (like Vercel preview deploys).
- **Manual dispatch**: triggers a full **EAS Build** with optional app store submission.

```bash
cd apps/mobile

# Preview build (TestFlight / internal APK)
eas build --profile preview --platform ios

# Production build + submit
eas build --profile production --platform ios
eas submit --profile production --platform ios

# OTA update (skip native build, push JS bundle)
eas update --branch preview --message "fix: typo on home screen"
```

Environment variables for each build profile are in `apps/mobile/eas.json`.

### GitHub Environments Setup

Create **staging** and **production** environments in your GitHub repo settings, then add:

| Scope | Variable / Secret | Where |
|-------|------------------|-------|
| **Supabase** | `SUPABASE_ACCESS_TOKEN` (secret) | Repository secret |
| **Supabase** | `SUPABASE_PROJECT_REF` (var) | Per environment |
| **Supabase** | `SUPABASE_DB_PASSWORD` (secret) | Per environment |
| **Supabase** | `AI_PROVIDER` (var) | Per environment |
| **Supabase** | `OPENAI_API_KEY` (secret) | Per environment |
| **Supabase** | `ANTHROPIC_API_KEY` (secret) | Per environment |
| **Supabase** | `GOOGLE_AI_API_KEY` (secret) | Per environment |
| **Supabase** | `MOONSHOT_API_KEY` (secret) | Per environment |
| **Vercel** | `VERCEL_TOKEN` (secret) | Repository secret |
| **Vercel** | `VERCEL_ORG_ID` (secret) | Repository secret |
| **EAS** | `EXPO_TOKEN` (secret) | Repository secret |
| **Vercel** | `VERCEL_ADMIN_PROJECT_ID` (var) | Per environment |
| **Vercel** | `VERCEL_WEB_PROJECT_ID` (var) | Per environment |
| **Vercel** | `VITE_SUPABASE_URL` (var) | Per environment |
| **Vercel** | `VITE_SUPABASE_ANON_KEY` (var) | Per environment |
