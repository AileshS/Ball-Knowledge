# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Ball Knowledge** is a Duolingo-style app for learning sports: rules, eras, legends, and current players, teams, and coaches, built around **long-term retention** (spaced repetition, active recall, callbacks to earlier lessons). The full product spec is in [`docs/PRD.md`](docs/PRD.md); read it before making product or architecture decisions.

**Status:** Phase 0 of the [roadmap](docs/ROADMAP.md): decisions recorded, no app code yet.

- Sport: **NFL**
- Stack: **Expo (React Native) + TypeScript** in an npm-workspaces monorepo
- Backend: **Supabase**, arriving in Phase 7

Decision records are in [`docs/decisions/`](docs/decisions/README.md). Build, test, and lint commands get added here in Phase 1.

## Product principles (apply these to every change)

1. **Retention beats engagement.** Every feature should help users *remember* players, teams, coaches, and history. Reject mechanics that only maximize time in the app (guilt streaks, infinite feeds, rewards for opening the app).
2. **Gamification rewards recall and mastery.** XP, streaks, and ranks are earned by correct recall and mastered items, never by raw activity.
3. **Callbacks everywhere.** New lessons should reintroduce previously learned items in new contexts. A name the user has learned should keep coming back.
4. **Accuracy is non-negotiable.** Sports fans will notice wrong stats. Every fact needs a source and a last-verified date. Never invent stats, contracts, quotes, or results, in code, seed data, or tests that might ship.
5. **Memory tips are seasoning, not the meal.** Mnemonics inspired by Memory OS (acronyms, the chain method, stories, memory palaces) appear only on big ordered or grouped content, like the list of eras. They're optional and dismissible, never on every lesson.
6. **One sport first, multi-sport by design.** v1 ships a single sport: the NFL, confirmed in [ADR 0001](docs/decisions/0001-sport-nfl.md). Don't hard-code sport-specific assumptions into shared models.

## Domain model (target shape)

- **Sport** → **Track** (`foundations` | `past` | `present`) → **Unit** (an era, position group, team…) → **Lesson** → **Exercise**.
- **KnowledgeItem:** the atomic fact the user learns (a player, stat, moment, rule, or contract). It links to **Entities** (Player, Team, Coach, Era, Moment) and carries `source` and `lastVerifiedAt`.
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

Still open (don't assume; check with the owner):
- Sports-data provider ([ADR 0004](docs/decisions/0004-sports-data-provider.md), deferred). Must be decided before Present-track stats or contracts are authored.
- Clip, photo, and logo licensing ([ADR 0005](docs/decisions/0005-media-rights.md), deferred). Text-first until then.
