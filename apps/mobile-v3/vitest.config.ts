/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  define: { __DEV__: 'false' },
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'ios', 'android', '.expo'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: [
        'lib/utils/**/*.{ts,tsx}',
        'lib/api/**/*.{ts,tsx}',
        'lib/state/**/*.{ts,tsx}',
        'lib/styles/**/*.{ts,tsx}',
        'lib/constants.ts',
        'features/camera/session.ts',
        'features/auth/**/*.{ts,tsx}',
        'features/reports/**/*.{ts,tsx}',
        'features/upload-queue/**/*.{ts,tsx}',
        'features/voice/**/*.{ts,tsx}',
        'features/audio/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/__mocks__/**', '**/*.d.ts'],
      thresholds: { lines: 50, functions: 50, branches: 40, statements: 50 },
    },
  },
});
