# 0006. No daily goal or "done for today" stop

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Owner

## Context

PRD §9 and CLAUDE.md principle 1 called for a small, finishable daily goal: today's due reviews (capped) plus one new lesson. Once met, the app would say "you're done for today" and stop offering more. Phase 6 built this.

After trying the playable slice, the owner decided the app shouldn't stop people who want to keep learning.

## Decision

Remove the daily goal entirely:

- No "done for today" state, and no daily cap on reviews.
- The Today card shows everything due now (most-forgotten first) and the next open lesson, every time.

## Consequences

- **Retention behavior is unchanged:**
  - Spaced repetition still decides *what* is due.
  - Missed facts still come back sooner.
  - Callbacks still open lessons.
- **The "finishable" promise of PRD §9 no longer holds:** after a long break, the review queue can be large. Sessions save after every answer, so users can stop at any point without losing anything.
- **The rest of principle 1 still stands:** no guilt notifications, no rewards for opening the app, no infinite feeds. Gamification (roadmap Phase 9) must still reward correct recall and mastery, not time spent.
- **The retention engine keeps `dailyPlan` and `maxDailyReviews`:** its simulations still use them to keep review load sane. The app just doesn't apply the cap.
