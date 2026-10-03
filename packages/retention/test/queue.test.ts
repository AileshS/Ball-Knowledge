import type { EntityId, ItemId, UserItemState } from '@ball-knowledge/core';
import { describe, expect, it } from 'vitest';
import {
  buildReviewQueue,
  createScheduler,
  dailyPlan,
  DEFAULT_RETENTION_CONFIG,
  isDoneForToday,
} from '../src/index';
import { addDays, addMinutes, itemId, learnInLesson, T0 } from './helpers';

const scheduler = createScheduler();

/** Learned items introduced on different days, so they come due at different times. */
function learnedOnDays(days: number[]): UserItemState[] {
  return days.map((d, i) => learnInLesson(scheduler, itemId(i + 1), addDays(T0, d)));
}

describe('buildReviewQueue', () => {
  it('returns only learned items that are due', () => {
    const states = [...learnedOnDays([0, 10]), scheduler.newItemState(itemId(9), T0)];
    const now = addDays(T0, 5);
    const queue = buildReviewQueue(scheduler, states, now);
    expect(queue).toEqual([itemId(1)]);
  });

  it('puts the most-forgotten items first', () => {
    const states = learnedOnDays([3, 0, 1]);
    const queue = buildReviewQueue(scheduler, states, addDays(T0, 20));
    expect(queue).toEqual([itemId(2), itemId(3), itemId(1)]);
  });

  it('includes items due later today when given a dueBy cutoff', () => {
    const [state] = learnedOnDays([0]);
    const justBefore = addMinutes(state!.due, -120);
    expect(buildReviewQueue(scheduler, [state!], justBefore)).toEqual([]);
    expect(
      buildReviewQueue(scheduler, [state!], justBefore, { dueBy: addMinutes(justBefore, 180) }),
    ).toEqual([itemId(1)]);
  });

  it('respects a limit', () => {
    const states = learnedOnDays([0, 0, 0, 0]);
    expect(buildReviewQueue(scheduler, states, addDays(T0, 30), { limit: 2 })).toHaveLength(2);
    expect(buildReviewQueue(scheduler, states, addDays(T0, 30), { limit: -1 })).toEqual([]);
  });

  it('spreads items about the same entity apart when possible', () => {
    const states = learnedOnDays([0, 1, 2, 3]);
    const entity = (s: string) => s as EntityId;
    const entityIdsByItem = new Map<ItemId, EntityId[]>([
      [itemId(1), [entity('fixture.player.alpha')]],
      [itemId(2), [entity('fixture.player.alpha')]],
      [itemId(3), [entity('fixture.player.beta')]],
      [itemId(4), [entity('fixture.player.beta')]],
    ]);
    const queue = buildReviewQueue(scheduler, states, addDays(T0, 30), { entityIdsByItem });
    expect(queue).toEqual([itemId(1), itemId(3), itemId(2), itemId(4)]);
  });
});

describe('dailyPlan and isDoneForToday', () => {
  it('plans due reviews plus one new lesson', () => {
    const states = learnedOnDays([0, 0]);
    const plan = dailyPlan(scheduler, states, addDays(T0, 30), { newLessonAvailable: true });
    expect(plan.reviewItemIds).toHaveLength(2);
    expect(plan.deferredCount).toBe(0);
    expect(plan.newLessons).toBe(1);
  });

  it('offers no new lesson when the path has none', () => {
    const plan = dailyPlan(scheduler, [], T0, { newLessonAvailable: false });
    expect(plan).toEqual({ reviewItemIds: [], deferredCount: 0, newLessons: 0 });
  });

  it('caps reviews and catches up before adding new material', () => {
    const cap = DEFAULT_RETENTION_CONFIG.maxDailyReviews;
    const states = learnedOnDays(Array.from({ length: cap + 7 }, () => 0));
    const plan = dailyPlan(scheduler, states, addDays(T0, 30), { newLessonAvailable: true });
    expect(plan.reviewItemIds).toHaveLength(cap);
    expect(plan.deferredCount).toBe(7);
    expect(plan.newLessons).toBe(0);
  });

  it('is done only when every planned review and the lesson are complete', () => {
    const states = learnedOnDays([0, 0]);
    const plan = dailyPlan(scheduler, states, addDays(T0, 30), { newLessonAvailable: true });
    const [first, second] = plan.reviewItemIds;
    expect(isDoneForToday(plan, { reviewedItemIds: [first!], lessonsCompleted: 1 })).toBe(false);
    expect(isDoneForToday(plan, { reviewedItemIds: [first!, second!], lessonsCompleted: 0 })).toBe(
      false,
    );
    expect(isDoneForToday(plan, { reviewedItemIds: [second!, first!], lessonsCompleted: 1 })).toBe(
      true,
    );
  });
});
