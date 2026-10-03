import {
  GradeSchema,
  UserItemStateSchema,
  type Grade,
  type ItemId,
  type KnowledgeItem,
  type UserItemState,
} from '@ball-knowledge/core';
import { fixtureLesson } from '@ball-knowledge/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildReviewQueue,
  createScheduler,
  createSeededRng,
  dailyPlan,
  isDoneForToday,
  masteryLevel,
  pickCallbacks,
} from '../src/index';
import { addMinutes, itemId, makeItem, review, T0 } from './helpers';

const scheduler = createScheduler();

// Fixed seed so a failure always reproduces; fast-check prints the counterexample.
const RUNS = { numRuns: 200, seed: 20261002 };

const gradeArb = fc.constantFrom<Grade>(...GradeSchema.options);
/** Gaps between reviews from immediately to ~4 months, in minutes. */
const gapArb = fc.integer({ min: 0, max: 60 * 24 * 120 });
const historyArb = fc.array(fc.record({ grade: gradeArb, gap: gapArb }), {
  minLength: 1,
  maxLength: 25,
});

type Step = { grade: Grade; gap: number };

/** Replays a review history from a new item and returns every intermediate state. */
function replay(history: Step[]): { states: UserItemState[]; times: Date[] } {
  let state = scheduler.newItemState(itemId(1), T0);
  let now = T0;
  const states: UserItemState[] = [];
  const times: Date[] = [];
  for (const { grade, gap } of history) {
    now = addMinutes(now, gap);
    state = review(scheduler, state, grade, now);
    states.push(state);
    times.push(now);
  }
  return { states, times };
}

describe('scheduler properties', () => {
  it('always schedules the next review in the future with sane memory values', () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        const { states, times } = replay(history);
        states.forEach((s, i) => {
          expect(s.due.getTime()).toBeGreaterThanOrEqual(times[i]!.getTime());
          expect(s.stability).toBeGreaterThan(0);
          expect(s.difficulty).toBeGreaterThanOrEqual(1);
          expect(s.difficulty).toBeLessThanOrEqual(10);
          expect(s.reps).toBe(i + 1);
          expect(UserItemStateSchema.safeParse(s).success).toBe(true);
        });
      }),
      RUNS,
    );
  });

  it('never schedules a better answer sooner than a worse one', () => {
    fc.assert(
      fc.property(historyArb, gapArb, (history, gap) => {
        const { states, times } = replay(history);
        const state = states.at(-1)!;
        const now = addMinutes(times.at(-1)!, gap);
        const dues = GradeSchema.options.map((g) => review(scheduler, state, g, now).due.getTime());
        for (let i = 1; i < dues.length; i++) expect(dues[i]).toBeGreaterThanOrEqual(dues[i - 1]!);
      }),
      RUNS,
    );
  });

  it('never makes an item Mastered from a single answer, or with fewer than 3 reviews', () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        const { states } = replay(history);
        expect(masteryLevel(states[0]!)).not.toBe('mastered');
        for (const s of states) if (s.reps < 3) expect(masteryLevel(s)).not.toBe('mastered');
      }),
      RUNS,
    );
  });

  it('is deterministic: replaying a history gives identical states', () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        expect(replay(history)).toEqual(replay(history));
      }),
      RUNS,
    );
  });

  it('predicts recall in [0, 1] that never increases without a review', () => {
    fc.assert(
      fc.property(historyArb, fc.array(gapArb, { minLength: 2, maxLength: 6 }), (history, gaps) => {
        const { states, times } = replay(history);
        const state = states.at(-1)!;
        let now = times.at(-1)!;
        let previous = scheduler.retrievability(state, now);
        for (const gap of gaps) {
          now = addMinutes(now, gap);
          const r = scheduler.retrievability(state, now);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(1);
          expect(r).toBeLessThanOrEqual(previous + 1e-12);
          previous = r;
        }
      }),
      RUNS,
    );
  });
});

/** A population of items, each reviewed through its own random history. */
const populationArb = fc.array(historyArb, { minLength: 0, maxLength: 30 }).map((histories) =>
  histories.map((history, i) => {
    let state = scheduler.newItemState(itemId(i + 1), T0);
    let now = T0;
    for (const { grade, gap } of history) {
      now = addMinutes(now, gap);
      state = review(scheduler, state, grade, now);
    }
    return state;
  }),
);
const nowArb = fc.integer({ min: 0, max: 60 * 24 * 400 }).map((m) => addMinutes(T0, m));

describe('review queue properties', () => {
  it('contains exactly the due learned items, once each, within the limit', () => {
    fc.assert(
      fc.property(
        populationArb,
        nowArb,
        fc.option(fc.nat(40), { nil: undefined }),
        (states, now, limit) => {
          const queue = buildReviewQueue(scheduler, states, now, { limit });
          const due = states.filter((s) => s.phase !== 'new' && s.due <= now).map((s) => s.itemId);
          expect(new Set(queue).size).toBe(queue.length);
          for (const id of queue) expect(due).toContain(id);
          expect(queue.length).toBe(limit === undefined ? due.length : Math.min(limit, due.length));
        },
      ),
      RUNS,
    );
  });

  it('plans a finishable day that counts as done once completed', () => {
    fc.assert(
      fc.property(populationArb, nowArb, fc.boolean(), (states, now, newLessonAvailable) => {
        const plan = dailyPlan(scheduler, states, now, { newLessonAvailable });
        expect(plan.reviewItemIds.length).toBeLessThanOrEqual(scheduler.config.maxDailyReviews);
        expect(plan.newLessons).toBeLessThanOrEqual(newLessonAvailable ? 1 : 0);
        expect(
          isDoneForToday(plan, {
            reviewedItemIds: plan.reviewItemIds,
            lessonsCompleted: plan.newLessons,
          }),
        ).toBe(true);
      }),
      RUNS,
    );
  });
});

describe('callback properties', () => {
  const tagArb = fc.constantFrom('era:fixture-era-one', 'era:fixture-era-two', 'team:testville');

  it('returns at most `count` distinct, learned items that the lesson does not introduce', () => {
    fc.assert(
      fc.property(
        populationArb,
        fc.array(fc.array(tagArb, { maxLength: 2 }), { maxLength: 30 }),
        fc.nat(6),
        fc.integer(),
        nowArb,
        (states, tagsPerItem, count, seed, now) => {
          const items = new Map<ItemId, KnowledgeItem>(
            states.map((s, i) => [
              s.itemId,
              makeItem(i + 1, { tags: [...new Set(tagsPerItem[i] ?? [])] }),
            ]),
          );
          const introduced = states.slice(0, 2).map((s) => s.itemId);
          const lesson = fixtureLesson({
            introducesItemIds: introduced.length > 0 ? introduced : [itemId(999)],
          });
          const picked = pickCallbacks(scheduler, {
            lesson,
            items,
            states: new Map(states.map((s) => [s.itemId, s])),
            now,
            rng: createSeededRng(seed),
            count,
          });
          expect(picked.length).toBeLessThanOrEqual(count);
          expect(new Set(picked).size).toBe(picked.length);
          for (const id of picked) {
            expect(introduced).not.toContain(id);
            expect(states.find((s) => s.itemId === id)?.phase).not.toBe('new');
          }
        },
      ),
      RUNS,
    );
  });
});
