import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every workspace package is its own test project.
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
