/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // React Native / Expo modules reference `__DEV__` as a global. Vitest
  // does not provide it, so define it as a compile-time constant for any
  // transitively-imported native modules (e.g. expo-image's logger setup).
  define: {
    __DEV__: 'false',
  },
  // The repo's tsconfig sets jsx="react-native" (RN babel handles it at
  // runtime). Vitest uses esbuild, so override to the automatic runtime
  // here to keep test files free of `import React` boilerplate.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Mobile unit tests only. RLS integration tests live in
    // supabase/tests and are run via supabase/tests/vitest.config.ts.
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'ios', 'android', '.expo'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // Coverage is enforced on `lib/` only — that's where the unit-tested
      // business logic lives. Screens and most components are exercised by
      // Maestro smoke flows instead, so measuring them with v8 here would
      // dilute the threshold without adding signal.
      include: ['lib/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__mocks__/**',
        '**/*.d.ts',
        // Generated / type-only modules.
        'lib/backend.ts',
        'lib/database.types.ts',
        // Native-only adapter — imports `expo-sqlite`, which cannot run
        // under the Node-based vitest runner. Exercised in app + Maestro.
        'lib/local-db/expo-adapter.ts',
      ],
      thresholds: {
        // "Do not regress" floors — set just below current observed coverage
        // so a drop in any tested module fails CI. Bump these as more tests
        // are added.
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
