/**
 * Time-simulation tests: a year of daily use by simulated learners whose true memory
 * differs from the scheduler's model (see simulation/learner.ts). Thresholds come
 * from product goals, not from tuning to these runs:
 * - PRD §12: day-30 recall of Mastered items >= 80% (the north star).
 * - PRD §9: the daily goal must be small and finishable. Budget ~10 minutes of reviews
 *   at ~13 s each ≈ 45 reviews/day at steady state, and never more than the plan cap.
 * - CLAUDE.md principle 3: learned items keep coming back, so none waits long past due.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION_CONFIG } from '../src/index';
import { FORGETFUL_LEARNER, TYPICAL_LEARNER, type LearnerProfile } from './simulation/learner';
import { meanDailyReviews, simulate, type SimulationResult } from './simulation/run';

const DAYS = 365;
const ITEMS_PER_LESSON = 4;
const STEADY_STATE_REVIEW_BUDGET = 45;
const NORTH_STAR_TARGET = 0.8;
/** Daily sessions cover everything due by day's end; only misses can roll to tomorrow. */
const MAX_OVERDUE_DAYS = 2;

const runYear = (profile: LearnerProfile, seed: number, skipDays?: ReadonlySet<number>) =>
  simulate({ profile, seed, days: DAYS, itemsPerLesson: ITEMS_PER_LESSON, skipDays });

function expectRetentionGoalsMet(result: SimulationResult): void {
  expect(result.northStar.reviews).toBeGreaterThan(500);
  expect(result.northStar.accuracy).toBeGreaterThanOrEqual(NORTH_STAR_TARGET);
  expect(result.masteredRecallAt30Days.items).toBeGreaterThan(500);
  expect(result.masteredRecallAt30Days.mean).toBeGreaterThanOrEqual(NORTH_STAR_TARGET);
}

function expectEveryActiveDayFinishable(result: SimulationResult): void {
  for (const day of result.days.filter((d) => d.active)) {
    expect(day.done, `day ${day.day} should be finishable`).toBe(true);
    expect(day.planned).toBeLessThanOrEqual(DEFAULT_RETENTION_CONFIG.maxDailyReviews);
  }
}

describe.each([
  { profile: TYPICAL_LEARNER, seed: 7 },
  { profile: TYPICAL_LEARNER, seed: 11 },
  { profile: FORGETFUL_LEARNER, seed: 7 },
])('a year of daily use: $profile.name learner, seed $seed', ({ profile, seed }) => {
  const result = runYear(profile, seed);

  it('teaches every lesson and keeps every learned item in rotation', () => {
    expect(result.days.reduce((n, d) => n + d.lessons, 0)).toBe(DAYS);
    expect(result.itemsLearned).toBe(DAYS * ITEMS_PER_LESSON);
    expect(result.masteryCounts.new).toBe(0);
    expect(result.maxOverdueDays).toBeLessThanOrEqual(MAX_OVERDUE_DAYS);
  });

  it('meets the north-star retention target for Mastered items', () => {
    expectRetentionGoalsMet(result);
  });

  it('keeps every daily goal finishable and the review load bounded', () => {
    expectEveryActiveDayFinishable(result);
    expect(result.days.filter((d) => d.deferred > 0)).toEqual([]);
    expect(meanDailyReviews(result, DAYS - 56, DAYS)).toBeLessThanOrEqual(
      STEADY_STATE_REVIEW_BUDGET,
    );
  });

  it('opens lessons with callbacks once there is something to call back', () => {
    expect(result.days.slice(1).every((d) => d.callbacks === 2)).toBe(true);
  });
});

describe('coming back from a two-week break', () => {
  const breakStart = 180;
  const returnDay = breakStart + 14;
  const skipDays = new Set(Array.from({ length: 14 }, (_, i) => breakStart + i));
  const result = runYear(TYPICAL_LEARNER, 7, skipDays);
  const afterReturn = result.days.slice(returnDay);

  it('caps the backlog so each day stays finishable', () => {
    expectEveryActiveDayFinishable(result);
    expect(afterReturn[0]!.deferred).toBeGreaterThan(0);
  });

  it('catches up on reviews before adding new lessons, within a week', () => {
    for (const day of afterReturn.filter((d) => d.deferred > 0)) expect(day.lessons).toBe(0);
    const caughtUp = afterReturn.findIndex((d) => d.deferred === 0);
    expect(caughtUp).toBeGreaterThan(0);
    expect(caughtUp).toBeLessThanOrEqual(7);
  });

  it('still meets the north-star target over the year', () => {
    expectRetentionGoalsMet(result);
  });
});
