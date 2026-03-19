# SiteLog AI

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

## Project Structure

```
/
├── apps/
│   ├── mobile/          # Expo app
│   └── web/             # Vite + React app
├── backend/
│   ├── migrations/      # SQL migration files
│   ├── functions/       # Backend functions (Deno)
│   ├── seed.sql         # Local dev seed data
│   └── config.toml      # Local backend config
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
