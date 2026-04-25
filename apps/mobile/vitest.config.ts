/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
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
