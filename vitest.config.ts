import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every workspace package is its own test project.
    projects: ['packages/*', 'apps/mobile'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/mobile/src/**/*.ts'],
      // Thin process entry points; their logic is tested through runCli().
      exclude: [
        'packages/*/src/cli.ts',
        // Native-only storage adapter and the generated-bundle import: covered by running the app.
        'apps/mobile/src/progress/create-store.ts',
        'apps/mobile/src/content/content.ts',
        // Thin Supabase/platform adapters: verified against the real project.
        'apps/mobile/src/sync/supabase.ts',
        'apps/mobile/src/sync/auth-storage.ts',
        'apps/mobile/src/sync/polyfill.ts',
        // React Native UI (theme, components, player): verified by running the app.
        'apps/mobile/src/ui/**',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        // The retention engine is the product's core (CLAUDE.md): CI fails below these.
        'packages/retention/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        // The content checker is the accuracy gate (CLAUDE.md principle 4).
        'packages/content-tools/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        // App logic (content loading, path model, saved progress); screens are checked by running the app.
        'apps/mobile/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
