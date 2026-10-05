# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Ball Knowledge** is a Duolingo-style app for learning sports: rules, eras, legends, and current players, teams, and coaches, built around **long-term retention** (spaced repetition, active recall, callbacks to earlier lessons). The full product spec is in [`docs/PRD.md`](docs/PRD.md); read it before making product or architecture decisions.

**Status:** see the [roadmap](docs/ROADMAP.md) for the current phase.

- Sport: **NFL**
- Stack: **Expo (React Native) + TypeScript** in an npm-workspaces monorepo
- Backend: **Supabase**, arriving in Phase 7

Decision records are in [`docs/decisions/`](docs/decisions/README.md).

## Commands

Requires Node 22.12+ (CI uses the version in `.nvmrc`). Run everything from the repo root:

| Command | What it does |
|---|---|
| `npm ci` | Install exact dependencies from the lockfile |
| `npm run check` | **Everything CI runs:** format check, lint, typecheck, tests with coverage. Must pass before every commit. |
| `npm test` | Run all tests once (Vitest; each `packages/*` is a test project) |
| `npm run test:watch` | Tests in watch mode |
| `npx vitest run packages/retention` | Run one package's tests |
| `npm run coverage` | Tests with a coverage report (`coverage/index.html`). CI fails if `packages/retention/src`, `packages/content-tools/src`, or `apps/mobile/src` drops below 90% lines. |
| `npm run content:check` | Validate everything in `content/` (also part of `npm run check`) |
| `npm run content:build` | Validate and write `dist/content/content.json`; add `-- --ship` for a release (approved content only) |
| `npm run web -w @ball-knowledge/mobile` | Build content, then run the app in a browser (http://localhost:8081) |
| `npm run start -w @ball-knowledge/mobile` | Build content, then start Expo for a phone (scan the QR code with Expo Go) |
| `npm run export:web -w @ball-knowledge/mobile` | Release web bundle; refuses unless all content is approved (`--ship`) |
| `npm run export:web:preview -w @ball-knowledge/mobile` | Preview web bundle with unreviewed content (CI runs this to prove the app still bundles) |
| `npm run sim -w @ball-knowledge/retention` | Print a 365-day simulation of the scheduler (review load, north-star recall) |
| `npm run lint` | ESLint (type-aware) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run format` | Prettier: rewrites code/config files. Markdown is excluded on purpose. |

## Repo layout

- `packages/core`: `@ball-knowledge/core`, the sport-agnostic domain model.
- `packages/content-tools`: `@ball-knowledge/content-tools`, which loads, validates, and bundles `content/` YAML. Authoring rules are in [`docs/content-authoring.md`](docs/content-authoring.md).
- `content/`: authored lessons, facts, and exercises as YAML (Phase 4).
- `apps/mobile`: `@ball-knowledge/mobile`, the Expo app (Expo Router; screens in `app/`).
  - Logic that doesn't depend on React Native lives in `src/` and is tested with Vitest: content loading (`src/content`), the path model (`src/model`), saved progress (`src/progress`), and sessions (`src/session`: answer checking, lesson/review planning, scoring, the daily goal, the dev clock).
  - The UI (`src/ui`, `app/`) stays thin and is verified by playing it in a browser. `src/ui/Player.tsx` runs both lessons and reviews.
  - Onboarding (`src/session/placement.ts`, `src/session/preferences.ts`): a first visit to a sport shows a welcome screen with an optional typed placement quiz over Foundations. A lesson is skipped only when every fact in it is answered correctly, and those facts are graded Easy. Each sport's chosen Past/Present track is kept on the device and decides which new lessons come next after Foundations. Reviews share one queue.
  - Rewards (`src/rewards`): XP is earned only by correct recall, weighted by difficulty and how long ago a fact was learned. The review streak treats rest days as neutral and keeps the best streak forever. Ranks are gated on mastered facts. There is a mastery map per unit, and saved "My tips" stay on the device. Everything is derived from the review log through `foldLog` (`src/sync/sync.ts`), so it syncs with no extra tables.
  - Question cues (`src/ui/CueCard.tsx`): a jersey cue is drawn as a plain jersey from the exercise's `visual` (no team colors or marks). Photo and clip cues show their text description, since media stays off until licensed (ADR 0005). The dev-only exercise gallery (`app/dev/gallery.tsx`, fictional content in `src/dev/gallery.ts`) plays every question type without saving. It shows in dev builds, or in preview builds with `EXPO_PUBLIC_DEV_TOOLS=1`.
  - Dev builds show a dev clock on the Today card (+1 day / +7 days) to test spacing. It only moves forward, because reviews must stay in chronological order.
  - The content bundle is generated into `src/generated/` (gitignored) by `npm run content -w @ball-knowledge/mobile`; app scripts do this automatically.
  - Progress is stored through a small key-value interface: expo-sqlite's store on iOS/Android (`create-store.ts`), localStorage on web (`create-store.web.ts`).
  - Accounts and sync (`src/sync`, `src/state/Account.tsx`): Supabase email + password sign-in ("Confirm email" off; ADR 0003), and two-way sync of the append-only review log plus lesson completions. States are rebuilt by replay (ADR 0003). Settings live in `apps/mobile/.env` (gitignored; see `.env.example`). Without them the app runs offline.
- `supabase/migrations/`: forward-only SQL. Apply each file once in the Supabase SQL editor, and never edit one that has already run. Setup steps are in [`docs/supabase-setup.md`](docs/supabase-setup.md).
- **Windows note:** run commands from the correctly cased path (`C:\Users\…\Downloads\…`). Workspace links created from a differently cased path make Metro report "Unable to resolve module @ball-knowledge/…".
- `packages/retention`: `@ball-knowledge/retention`, the retention engine. See its [README](packages/retention/README.md) for modules, defaults, and simulation results. Tunables live in `src/config.ts`.
- Workspace packages export TypeScript source directly (`"exports": "./src/index.ts"`); there is no build step.
- ESLint enforces purity in `packages/core/src` and `packages/retention/src`:
  - no Node or UI imports
  - no `console`, `process`, `Buffer`, or `globalThis`
  - no `Date.now()`, `Date()`, `new Date()`, or `Math.random()`; inject time and RNG instead
- The `src` tsconfigs don't load Node types, so `tsc` rejects Node globals too. Tests have their own `test/tsconfig.json` with Node types.

## Product principles (apply these to every change)

1. **Retention beats engagement.** Every feature should help users *remember* players, teams, coaches, and history. Reject mechanics that only maximize time in the app (guilt streaks, infinite feeds, rewards for opening the app).
2. **Gamification rewards recall and mastery.** XP, streaks, and ranks are earned by correct recall and mastered items, never by raw activity.
3. **Callbacks everywhere.** New lessons should reintroduce previously learned items in new contexts. A name the user has learned should keep coming back.
4. **Accuracy is non-negotiable.** Sports fans will notice wrong stats. Every fact needs a source and a last-verified date. Never invent stats, contracts, quotes, or results, in code, seed data, or tests that might ship.
5. **Memory tips are seasoning, not the meal.** Mnemonics inspired by Memory OS (acronyms, the chain method, stories, memory palaces) appear only on big ordered or grouped content, like the list of eras. They're optional and dismissible, never on every lesson.
6. **One sport first, multi-sport by design.** v1 ships a single sport: the NFL, confirmed in [ADR 0001](docs/decisions/0001-sport-nfl.md). Don't hard-code sport-specific assumptions into shared models.

## Domain model

The zod schemas in `packages/core/src` are the source of truth for this shape (Phase 2). Fixtures for tests are in `@ball-knowledge/core/testing`.

- **Sport** → **Track** (`foundations` | `past` | `present`) → **Unit** (an era, position group, team…) → **Lesson** → **Exercise**.
- **KnowledgeItem:** the atomic fact the user learns (a player, stat, moment, rule, or contract). It links to **Entities** (Player, Team, Coach, Era, Moment) and carries `sources` (at least one) and `lastVerifiedAt`.
- **Exercise:** tests one or more KnowledgeItems through a cue type (name, photo, jersey, stat, timeline, clip).
- **MemoryTip:** an optional mnemonic (`acronym` | `chain` | `story` | `palace`) attached to a *set* of KnowledgeItems. It is shown when that content is introduced and again in review after a miss.
- **UserItemState:** per-user memory state for each KnowledgeItem (FSRS-style stability/difficulty, due date, mastery level). It drives the Review queue and lesson callbacks.
- Present-track stats and contracts are referenced **by ID from a data provider**, not copied into lesson text, so they can be refreshed without rewriting lessons.

## Conventions

- Keep content (lessons, items, entities) as **data**, separate from app code, so non-engineers can author and fact-check it.
- Put scheduling and retention logic in one isolated, well-tested module. It's the product's core, so test it with property and time-simulation tests.
- Keep the user-facing tone confident, fun, and fan-friendly, and keep lessons short (3–5 minutes).
- Highlight clips: use only licensed or embeddable sources, and always provide a text fallback.

## Workflow guardrails (every change must be non-destructive)

- **Branches:** one branch per phase or feature. Never commit to `main`, never force-push, never rewrite published history. Merge PRs with merge commits.
- **Push and PRs:** ask the owner before pushing or opening PRs.
- **Additive changes:** `docs/PRD.md` belongs to the owner. Record decisions as dated notes and [decision records](docs/decisions/README.md); never delete PRD text.
- **Tooling:** no global installs or system changes. Tooling comes from `devDependencies` run through npm scripts, and `package-lock.json` is committed.
- **Secrets:** never commit them. Only `.env.example` goes in git.
- **Loop engineering:** every change runs a **build → check → review → fix** loop until it's green:
  - `npm run check` passes.
  - The diff touches only the intended files.
  - The self-review has no open findings.
  
  If the loop doesn't converge in 5 iterations, or a fix would be destructive, stop and report.
- **Test data:** tests and fixtures use obviously fictional entities (e.g., "Fixture Player Alpha") marked `fixture: true`, never real-looking stats.
- **Media:** no player photos or team logos until [ADR 0005](docs/decisions/0005-media-rights.md) is resolved.

## Decisions

Resolved:
- Sport: **NFL** ([ADR 0001](docs/decisions/0001-sport-nfl.md))
- Platform/stack: **Expo + TypeScript** ([ADR 0002](docs/decisions/0002-stack-expo-typescript.md))
- Backend: **Supabase** ([ADR 0003](docs/decisions/0003-backend-supabase.md))
- Daily goal: **none**, no "done for today" stop or daily review cap ([ADR 0006](docs/decisions/0006-no-daily-stop.md), reverses the PRD §9 daily goal)

Still open (don't assume; check with the owner):
- Sports-data provider ([ADR 0004](docs/decisions/0004-sports-data-provider.md), deferred). Must be decided before Present-track stats or contracts are authored.
- Clip, photo, and logo licensing ([ADR 0005](docs/decisions/0005-media-rights.md), deferred). Text-first until then.
