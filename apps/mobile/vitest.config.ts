/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
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
    // Mobile unit tests only. RLS integration tests live in
    // supabase/tests and are run via supabase/tests/vitest.config.ts.
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'ios', 'android', '.expo'],
  },
})
