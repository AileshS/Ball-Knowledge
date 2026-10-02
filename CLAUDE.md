# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Ball Knowledge** is a Duolingo-style app for learning sports: rules, eras, legends, and current players, teams, and coaches, built around **long-term retention** (spaced repetition, active recall, callbacks to earlier lessons). The full product spec is in [`docs/PRD.md`](docs/PRD.md); read it before making product or architecture decisions.

**Status:** pre-code. The tech stack has not been chosen yet. When it is, add the build, test, and lint commands to this file.

## Product principles (apply these to every change)

1. **Retention beats engagement.** Every feature should help users *remember* players, teams, coaches, and history. Reject mechanics that only maximize time in the app (guilt streaks, infinite feeds, rewards for opening the app).
2. **Gamification rewards recall and mastery.** XP, streaks, and ranks are earned by correct recall and mastered items, never by raw activity.
3. **Callbacks everywhere.** New lessons should reintroduce previously learned items in new contexts. A name the user has learned should keep coming back.
4. **Accuracy is non-negotiable.** Sports fans will notice wrong stats. Every fact needs a source and a last-verified date. Never invent stats, contracts, quotes, or results, in code, seed data, or tests that might ship.
5. **Memory tips are seasoning, not the meal.** Mnemonics inspired by Memory OS (acronyms, the chain method, stories, memory palaces) appear only on big ordered or grouped content, like the list of eras. They're optional and dismissible, never on every lesson.
6. **One sport first, multi-sport by design.** v1 ships a single sport (NFL is the recommendation in the PRD, pending confirmation). Don't hard-code sport-specific assumptions into shared models.

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

## Open decisions (don't assume; check with the owner)

- Which sport ships first (NFL recommended).
- Platform/stack (native, cross-platform, or web-first).
- Sports-data provider and clip licensing.
