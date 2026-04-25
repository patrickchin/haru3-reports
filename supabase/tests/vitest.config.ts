/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

// Standalone Vitest config for the RLS integration suite.
// Runs against either a local `supabase start` stack (default) or the hosted
// dev project when EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
// (or SUPABASE_URL / SUPABASE_ANON_KEY) are exported in the environment.
// See supabase/tests/README.md.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
