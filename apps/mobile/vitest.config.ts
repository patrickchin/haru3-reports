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
    include: ['**/*.test.{ts,tsx}', '../../supabase/tests/**/*.test.ts'],
    exclude: ['node_modules', 'ios', 'android', '.expo'],
  },
})
