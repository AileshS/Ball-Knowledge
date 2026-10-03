import { fixtureUserItemState } from '@ball-knowledge/core/testing';
import { describe, expect, it } from 'vitest';
import {
  createScheduler,
  gradeAnswer,
  isFading,
  masteryLevel,
  MASTERY_ORDER,
  unitHealth,
} from '../src/index';
import { addDays, itemId, learnInLesson, review, reviewUntil, T0 } from './helpers';

const scheduler = createScheduler();

describe('gradeAnswer', () => {
  it.each([
    [{ correct: false, mode: 'production' }, 'again'],
    [{ correct: false, mode: 'recognition', responseMs: 1_000 }, 'again'],
    [{ correct: true, mode: 'production', usedHint: true, responseMs: 1_000 }, 'hard'],
    [{ correct: true, mode: 'recognition', responseMs: 20_000 }, 'hard'],
    [{ correct: true, mode: 'recognition' }, 'good'],
    [{ correct: true, mode: 'recognition', responseMs: 1_000 }, 'good'],
    [{ correct: true, mode: 'production', responseMs: 8_000 }, 'good'],
    [{ correct: true, mode: 'production', responseMs: 4_000 }, 'easy'],
    [{ correct: true, mode: 'production' }, 'good'],
  ] as const)('%j → %s', (answer, grade) => {
    expect(gradeAnswer(answer)).toBe(grade);
  });
});

describe('masteryLevel', () => {
  it('orders levels from least to most known', () => {
    expect(MASTERY_ORDER).toEqual(['new', 'learning', 'familiar', 'mastered']);
  });

  it('maps memory state to the four levels', () => {
    const base = { phase: 'review' as const, reps: 5 };
    expect(masteryLevel(fixtureUserItemState({ phase: 'new', reps: 0 }))).toBe('new');
    expect(masteryLevel(fixtureUserItemState({ phase: 'relearning', stability: 90 }))).toBe(
      'learning',
    );
    expect(masteryLevel(fixtureUserItemState({ ...base, stability: 3 }))).toBe('learning');
    expect(masteryLevel(fixtureUserItemState({ ...base, stability: 7 }))).toBe('familiar');
    expect(masteryLevel(fixtureUserItemState({ ...base, stability: 30 }))).toBe('mastered');
  });

  it('needs a minimum number of reviews before Mastered', () => {
    expect(masteryLevel(fixtureUserItemState({ phase: 'review', stability: 60, reps: 2 }))).toBe(
      'familiar',
    );
  });

  it('climbs to Mastered with repeated successful reviews, and drops after a miss', () => {
    const mastered = reviewUntil(
      scheduler,
      learnInLesson(scheduler, itemId(1), T0),
      (s) => masteryLevel(s) === 'mastered',
    );
    expect(masteryLevel(mastered)).toBe('mastered');
    const missed = review(scheduler, mastered, 'again', mastered.due);
    expect(masteryLevel(missed)).toBe('learning');
  });
});

describe('decay', () => {
  it('flags learned items as fading once predicted recall drops', () => {
    const learned = learnInLesson(scheduler, itemId(1), T0);
    expect(isFading(scheduler, learned, learned.lastReviewedAt!)).toBe(false);
    expect(isFading(scheduler, learned, addDays(learned.due, 10))).toBe(true);
    expect(isFading(scheduler, scheduler.newItemState(itemId(2), T0), addDays(T0, 99))).toBe(false);
  });

  it('summarizes unit health and asks for a refresh when items fade', () => {
    const states = [1, 2, 3].map((n) => learnInLesson(scheduler, itemId(n), T0));
    states.push(scheduler.newItemState(itemId(4), T0));

    const fresh = unitHealth(scheduler, states, addDays(T0, 1));
    expect(fresh).toMatchObject({ total: 4, learned: 3, fading: 0, needsRefresh: false });
    expect(fresh.averageRetrievability).toBeGreaterThan(0.85);

    const stale = unitHealth(scheduler, states, addDays(T0, 30));
    expect(stale.fading).toBe(3);
    expect(stale.needsRefresh).toBe(true);
    expect(stale.averageRetrievability).toBeLessThan(fresh.averageRetrievability);
  });

  it('reports an untouched unit as not learned and not needing a refresh', () => {
    const health = unitHealth(scheduler, [scheduler.newItemState(itemId(1), T0)], T0);
    expect(health).toEqual({
      total: 1,
      learned: 0,
      mastered: 0,
      fading: 0,
      averageRetrievability: 0,
      needsRefresh: false,
    });
  });
});
