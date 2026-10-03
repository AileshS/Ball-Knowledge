# @ball-knowledge/retention

The retention engine is the product's core. It decides what each user reviews, when, and how. It's made of pure functions:

- Time (`now`) and randomness (a seeded `Rng`) are always passed in.
- There's no I/O.
- ESLint and `tsc` reject clock, random, and Node access in `src/`.

## What's in it

| Module | Responsibility (PRD reference) |
|---|---|
| `scheduler.ts` | FSRS scheduling via [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), wrapped so the library can be swapped. Fuzz is off, so replaying a review log is deterministic (§8, ADR 0003). |
| `grading.ts` | Answer → grade. Wrong = again; hint or slow = hard; correct = good; fast typed recall = easy (§8: active recall). |
| `mastery.ts` | New → Learning → Familiar → Mastered levels, fading items, and unit health / "needs a refresh" (§8: visible decay). |
| `queue.ts` | Review queue (most-forgotten first, interleaved by entity), daily plan (due reviews + 1 lesson, capped), and "done for today" (§9). |
| `callbacks.ts` | Picks earlier items to open a lesson with, favoring related and fading ones (§7.4, principle 3). |
| `cues.ts` | Rotates cues (name, jersey, stat…), skipping media until licensed. Also handles the move from recognition to typed recall as mastery grows (§8, ADR 0005). |
| `tips.ts` | Re-shows a memory tip after a miss on one of its items (§8). |
| `config.ts` | Every tunable number, with the reasoning behind it. |

## Key defaults (see `config.ts`)

- **Target retention:** 90% when an item comes due.
- **Maximum interval:** 365 days, so learned names keep coming back.
- **Mastered:** stability ≥ 30 days and ≥ 3 reviews. Familiar: stability ≥ 7 days.
- **Daily plan:** at most 50 reviews. When the backlog is over the cap, the new lesson waits until the user has caught up.

## Simulation

`npm run sim -w @ball-knowledge/retention` prints a year of simulated daily use: 1 lesson a day, 4 new items per lesson.

The simulated learner's true memory runs on *different* FSRS weights than the scheduler, with each item in a hidden easy, normal, or hard class (`test/simulation/learner.ts`). So the scheduler is tested on how well it adapts, not against its own model. These learner parameters are assumptions; re-check them against real review logs.

Results at seed 7:

| Learner | Reviews/day, last 8 weeks | North star: Mastered items 30+ days after learning | True recall 30 days after reaching Mastered |
|---|---|---|---|
| typical | 28.9 | 90.5% | 92.3% |
| forgetful | 32.8 | 91.5% | 91.6% |

`test/simulation.test.ts` asserts these against product targets, not tuned values:

- North star ≥ 80% (PRD §12).
- Steady-state load ≤ 45 reviews/day (≈10 minutes).
- Every daily goal finishable.
- Nothing waits more than 2 days past due.
- After a 2-week break, the backlog is capped and caught up within a week.

## Known caveat

ts-fsrs 5.x adds four deprecated helper methods to `Date.prototype` when it's imported; 6.0 removes them. Nothing here calls them. Upgrade to 6.0 once it's stable (it's in beta as of 2026-10).
