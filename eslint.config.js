import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Shared domain and retention code must run anywhere (app, server, tools), and the
// retention engine must be deterministic: time and randomness are always injected.
const purePackageSources = ['packages/core/src/**/*.ts', 'packages/retention/src/**/*.ts'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/.expo/',
    'apps/mobile/src/generated/',
    'apps/mobile/expo-env.d.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: purePackageSources,
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'child_process'],
              message: 'Shared packages must not depend on Node APIs; they also run in the app.',
            },
            {
              group: ['react', 'react-native', 'expo', 'expo-*'],
              message: 'Shared packages must not depend on UI frameworks.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Inject `now` instead; scheduling must be deterministic and testable.',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'Inject a seeded RNG instead; results must be reproducible.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject `now` instead of reading the system clock.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: '`Date()` reads the system clock; inject `now` instead.',
        },
      ],
      // Closes `globalThis.Date.now()`-style escapes. Node-only globals are also
      // rejected by `tsc`, because src tsconfigs don't load Node types.
      'no-restricted-globals': [
        'error',
        ...['globalThis', 'global', 'process', 'Buffer', 'require', 'module'].map((name) => ({
          name,
          message: 'Shared packages must stay platform-neutral and deterministic.',
        })),
      ],
    },
  },
  prettier,
]);
