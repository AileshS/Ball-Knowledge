import type { Grade, ItemId, KnowledgeItem, UserItemState } from '@ball-knowledge/core';
import { fixtureItem } from '@ball-knowledge/core/testing';
import { DAY_MS, type Scheduler } from '../src/index';

/** A fixed start time for tests: no test ever reads the real clock. */
export const T0 = new Date('2026-01-05T09:00:00.000Z');

export const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export const itemId = (n: number) => `fixture.item.n${n}` as ItemId;

/** A fictional item with tags/entities chosen by the test. */
export function makeItem(
  n: number,
  overrides: { tags?: string[]; entityIds?: string[] } = {},
): KnowledgeItem {
  return fixtureItem({
    id: itemId(n),
    label: `Fixture fact ${n}`,
    entityIds: overrides.entityIds ?? [],
    tags: overrides.tags ?? [],
  });
}

/** Applies one review with defaults for the parts a test doesn't care about. */
export function review(
  scheduler: Scheduler,
  state: UserItemState,
  grade: Grade,
  now: Date,
): UserItemState {
  return scheduler.applyReview(state, {
    grade,
    now,
    cue: 'name',
    exerciseType: 'multiple_choice',
    context: 'review',
  }).state;
}

/** Introduces an item the way a lesson does: first answer, then a recall check 5 minutes later. */
export function learnInLesson(
  scheduler: Scheduler,
  id: ItemId,
  now: Date,
  grades: [Grade, Grade] = ['good', 'good'],
): UserItemState {
  const first = review(scheduler, scheduler.newItemState(id, now), grades[0], now);
  return review(scheduler, first, grades[1], addMinutes(now, 5));
}

/** Reviews an item `good` at each due date until it reaches the predicate (bounded). */
export function reviewUntil(
  scheduler: Scheduler,
  state: UserItemState,
  done: (s: UserItemState) => boolean,
  maxReviews = 30,
): UserItemState {
  let current = state;
  for (let i = 0; i < maxReviews && !done(current); i++) {
    current = review(scheduler, current, 'good', current.due);
  }
  return current;
}
