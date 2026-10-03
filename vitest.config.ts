import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every workspace package is its own test project.
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      // Thin process entry points; their logic is tested through runCli().
      exclude: ['packages/*/src/cli.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        // The retention engine is the product's core (CLAUDE.md): CI fails below these.
        'packages/retention/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
        // The content checker is the accuracy gate (CLAUDE.md principle 4).
        'packages/content-tools/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
