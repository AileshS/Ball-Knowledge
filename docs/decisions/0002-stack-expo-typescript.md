# 0002. Expo (React Native) + TypeScript, npm-workspaces monorepo

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Owner

## Context

The PRD (§11, §13.6) wants iOS and Android, or a mobile-first web app if that is faster to validate. Constraints:

- Development happens on a Windows PC, which can't run Xcode.
- A small team, possibly one person, needs to cover three platforms.
- The scheduling/retention logic is the product's core. It has to be isolated and heavily tested (CLAUDE.md conventions), and it should be reusable later by tooling and the backend.

Options considered:

| Option | Pros | Cons |
|---|---|---|
| **Expo (React Native) + TypeScript** | One codebase for iOS, Android, and web. Works from Windows. Test on a phone with Expo Go; store builds through EAS cloud builds (no Mac needed). | Native modules are limited to Expo-compatible ones; some platform polish takes extra work. |
| Web-first PWA (Next.js) | Fastest to validate | Native store apps later likely mean rewriting the UI layer |
| Native (Swift + Kotlin) | Best platform feel | Two codebases, and iOS development needs a Mac |

## Decision

- **App:** Expo (React Native) with **TypeScript** and Expo Router, in `apps/mobile` (Phase 5).
- **Repo shape:** an **npm workspaces** monorepo. npm ships with Node, so no extra global tools are needed.

  ```
  apps/mobile             Expo app (Phase 5)
  packages/core           domain schemas and types (zod)
  packages/retention      scheduling and retention engine (pure TypeScript)
  packages/content-tools  content validator and bundle builder (Phase 4)
  content/nfl             authored content as data (Phase 4)
  docs/                   PRD, decision records, roadmap
  ```
- **Internal source packages:** workspace packages export their TypeScript source directly (`"exports": "./src/index.ts"`), with no build step. Expo's bundler, Vitest, and `tsc` all consume the source as-is.
- **Quality tooling:** strict TypeScript, ESLint (flat config with typescript-eslint), Prettier, and Vitest with **fast-check** for property-based tests. GitHub Actions CI runs the same `npm run check` used locally.

## Consequences

- The retention engine and domain model are plain TypeScript with no React or Expo dependency, so they can be tested in isolation and reused by content tools and server code.
- iOS builds go through EAS cloud builds. Day-to-day testing uses Expo Go on a phone and the web target in a browser.
- Monorepo dependencies are installed with `npm ci` at the root, and `package-lock.json` is committed.
- Anything that needs a custom native module must be checked for Expo compatibility first.
