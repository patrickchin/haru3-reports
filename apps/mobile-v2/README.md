# Harpa v2 (Mobile)

Clean-slate rewrite of the Harpa mobile app. Phase 0 scaffold.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Expo CLI
- iOS Simulator (macOS) or Android Studio

## Environment Variables

Create a `.env` file in the workspace root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_USE_FIXTURES=false
EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH=false
EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=false
```

## Development

```bash
# From monorepo root
pnpm install

# Start dev server
pnpm --filter mobile-v2 start

# Run iOS
pnpm --filter mobile-v2 ios

# Run iOS with fixtures
pnpm --filter mobile-v2 ios:mock

# Run Android
pnpm --filter mobile-v2 android

# Tests
pnpm --filter mobile-v2 test
pnpm --filter mobile-v2 test:watch
pnpm --filter mobile-v2 test:coverage

# Type check
pnpm --filter mobile-v2 typecheck

# Lint
pnpm --filter mobile-v2 lint
```

## Structure

```
app/              Expo Router routes (composition only)
src/
  infra/          Singletons (Supabase, React Query, env, IDs, types)
  design-tokens/  Colors, spacing (shared with Tailwind)
  shared/         UI primitives (Button, Card, Sheet, TextField)
  features/       Vertical slices (auth, projects, reports, notes, files)
```

## Phase 0 Status

- ✅ Toolchain configured (Expo SDK 55, React 19, NativeWind v4)
- ✅ Auth flow (phone OTP sign-in, onboarding)
- ✅ Shared UI primitives
- ✅ Vitest setup
- ⏳ Projects list (stubbed)
- ⏳ Reports (Phase 1)
- ⏳ Voice notes (Phase 1)
- ⏳ Upload queue (Phase 2)

See `apps/mobile-v2/docs/` for architecture and implementation details.

## Docs

- [06-design-principles.md](docs/06-design-principles.md) — AUTHORITATIVE design rules
- [02-architecture.md](docs/02-architecture.md) — High-level structure
- [03-implementation.md](docs/03-implementation.md) — Code conventions
- [01-lessons-learned.md](docs/01-lessons-learned.md) — R-patterns to avoid
