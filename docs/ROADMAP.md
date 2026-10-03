# Ball Knowledge build roadmap

How v1 (see [PRD](PRD.md) §11) gets built, one phase at a time. The order is **core logic → content pipeline → playable slice → accounts → breadth**. The riskiest, most valuable piece, the retention engine, gets built and proven first.

Each phase is one branch and one pull request. Merge PRs in order, using **merge commits** (not squash) so stacked branches stay conflict-free.

## How every phase is checked (loop engineering)

A phase is done when it passes a closed **build → check → review → fix** loop, not when the code is written:

1. **Define:** turn the phase's acceptance criteria, the workflow guardrails in [CLAUDE.md](../CLAUDE.md), and the relevant product principles into a checklist.
2. **Build:** make the smallest increment that moves the checklist forward.
3. **Automated check:** `npm run check` (typecheck, lint, unit, property, and simulation tests).
4. **Guardrail audit:**
   - The diff touches only the intended files.
   - No PRD text is deleted.
   - No secrets.
   - No real-looking sports facts in tests.
   - The retention engine stays pure.
5. **Self-review:** review the diff against the checklist and the PRD.
6. **Fix** what's found, then repeat from step 3.

If the loop doesn't converge within 5 iterations, or a fix would need a destructive action, stop and escalate to the owner.

## Phases

| Phase | What ships | Status |
|---|---|---|
| 0 | Decision records ([`decisions/`](decisions/README.md)), this roadmap, repo guardrails | Done |
| 1 | Monorepo scaffold: npm workspaces, strict TypeScript, ESLint, Prettier, Vitest, CI | Done |
| 2 | Domain model (`packages/core`): zod schemas for sports, tracks, units, entities, knowledge items, exercises, lessons, memory tips, user state, review log | Done |
| 3 | Retention engine (`packages/retention`): FSRS scheduling, mastery levels, decay, review queue, daily plan, callbacks, cue rotation, memory-tip re-show; unit, property, and 365-day simulation tests | Done |
| 4 | Content pipeline: YAML content in `content/nfl/`, `content:check` validator, `content:build` bundle, authoring guide; first Foundations unit from the official rulebook, left in review until the owner approves | Done (content awaiting owner review) |
| 5 | Expo app shell (`apps/mobile`): sport picker, track picker, learning path, local persistence behind a repository interface | Done |
| 6 | **Playable vertical slice:** lesson player (callbacks → new items → recall check), first exercise types, review session, "done for today," dev clock-advance. Test with 3–5 target users before scaling content | Planned |
| 7 | Accounts and sync (Supabase): email/Apple/Google auth, row-level security, review-log sync, account deletion | Planned |
| 8 | Onboarding: placement quiz, Foundations skip, Past/Present switching on one review queue | Planned |
| 9 | Gamification: recall-only XP, review streak (no guilt), daily goal, mastery-gated ranks, mastery map, "My tips" | Planned |
| 10 | Remaining exercise types: match, timeline, identify (jersey/silhouette), who-did-it, clip with text fallback | Planned |
| 11 | Content production: full Foundations; Past (all eras overview + 2–3 deep dives); Present (all position groups + "Is this trade worth it?") | Planned. Gated on [ADR 0004](decisions/0004-sports-data-provider.md) |
| 12 | Measurement: north-star recall metric, review completion, D7/D30, "used it in a real conversation" prompt, privacy policy | Planned |
| 13 | Beta and release: EAS builds, TestFlight / Play internal testing, store listings | Planned |

## Owner decision gates

- **Sports-data provider** ([ADR 0004](decisions/0004-sports-data-provider.md)): before Present-track stats or contracts are authored.
- **Clip, photo, and logo licensing** ([ADR 0005](decisions/0005-media-rights.md)): before any media ships.
- **Repository license:** whether to add one, and which.
