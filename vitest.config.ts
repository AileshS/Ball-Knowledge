import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every workspace package is its own test project.
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        // The retention engine is the product's core (CLAUDE.md): CI fails below these.
        'packages/retention/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
