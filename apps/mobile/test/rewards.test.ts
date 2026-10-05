import type {
  Grade,
  ItemId,
  ReviewContext,
  ReviewLogEntry,
  UserItemState,
} from '@ball-knowledge/core';
import { createScheduler, DAY_MS } from '@ball-knowledge/retention';
import { describe, expect, it } from 'vitest';
import { masteredCount, masteryMap } from '../src/rewards/mastery-map';
import { rankFor, RANKS } from '../src/rewards/ranks';
import { readSavedTips, SAVED_TIPS_KEY, toggled, toggleSavedTip } from '../src/rewards/saved-tips';
import { reviewStreak } from '../src/rewards/streak';
import { xpForAnswer, xpTotals, XP_RULES } from '../src/rewards/xp';
import { MemoryStore } from '../src/progress/store';
import { foldLog, replayStates } from '../src/sync/sync';
import { repoContent } from './helpers';

const scheduler = createScheduler();
const content = repoContent();
const TD = 'nfl.rules.touchdown-points' as ItemId;
const FG = 'nfl.rules.field-goal-points' as ItemId;

/** Builds a review log the way the app would, answering at the given times. */
function logOf(answers: [ItemId, string, Grade?, ReviewContext?][]): ReviewLogEntry[] {
  const states = new Map<ItemId, UserItemState>();
  return answers.map(([id, at, grade = 'good', context = 'review']) => {
    const now = new Date(at);
    const r = scheduler.applyReview(states.get(id) ?? scheduler.newItemState(id, now), {
      grade,
      now,
      cue: 'name',
      exerciseType: 'identify',
      context,
    });
    states.set(id, r.state);
    return r.logEntry;
  });
}

describe('XP', () => {
  const [entry] = logOf([[TD, '2026-10-01T09:00:00Z']]);

  it('rewards correct recall only, with more for older and harder facts', () => {
    expect(xpForAnswer(undefined, entry!)).toBe(XP_RULES.base);
    expect(xpForAnswer(undefined, { ...entry!, grade: 'again', correct: false })).toBe(0);
    expect(xpForAnswer(undefined, { ...entry!, daysSinceFirstLearned: 30 })).toBe(15);
    expect(xpForAnswer(undefined, { ...entry!, daysSinceFirstLearned: 365 })).toBe(20);
    const hard = { ...scheduler.newItemState(TD, new Date()), difficulty: 9 };
    expect(xpForAnswer(hard, entry!)).toBe(14);
    const maxed = { ...hard, difficulty: 10 };
    expect(xpForAnswer(maxed, { ...entry!, daysSinceFirstLearned: 90 })).toBe(30);
    expect(xpForAnswer(undefined, { ...entry!, context: 'placement' })).toBe(XP_RULES.placement);
  });

  it('totals XP from the log, and today’s share', () => {
    const log = logOf([
      [TD, '2026-10-01T09:00:00Z'],
      [TD, '2026-10-01T09:05:00Z', 'again'],
      [FG, '2026-10-03T09:00:00Z'],
    ]);
    const totals = xpTotals(scheduler, log, new Date('2026-10-03T00:00:00Z'));
    expect(totals.today).toBe(10);
    expect(totals.total).toBe(20);
    expect(xpTotals(scheduler, [], new Date()).total).toBe(0);
  });
});

describe('foldLog', () => {
  it('visits answers in time order with the state before and after', () => {
    const log = logOf([
      [TD, '2026-10-01T09:00:00Z'],
      [TD, '2026-10-02T09:00:00Z'],
    ]);
    const seen: (number | undefined)[] = [];
    const states = foldLog(scheduler, [...log].reverse(), ({ before, after }) => {
      seen.push(before?.reps);
      expect(after.reps).toBe((before?.reps ?? 0) + 1);
    });
    expect(seen).toEqual([undefined, 1]);
    expect(states).toEqual(replayStates(scheduler, log));
  });
});

describe('review streak', () => {
  const startOfDay = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const streak = (log: ReviewLogEntry[], now: string) =>
    reviewStreak({ scheduler, log, now: new Date(now), startOfDay });

  it('starts at zero with nothing done', () => {
    expect(streak([], '2026-10-04T12:00:00Z')).toEqual({ current: 0, best: 0, today: 'open' });
  });

  it('counts a day with activity when nothing was due, and today once done', () => {
    const log = logOf([[TD, '2026-10-04T09:00:00Z', 'good', 'lesson']]);
    expect(streak(log, '2026-10-04T12:00:00Z')).toEqual({ current: 1, best: 1, today: 'kept' });
  });

  it('keeps going through rest days, and never counts an open today as missed', () => {
    // Easy on a new fact: next due several days later, so the days between are rest days.
    const log = logOf([[TD, '2026-10-01T09:00:00Z', 'easy', 'lesson']]);
    const due = scheduler.applyReview(
      scheduler.newItemState(TD, new Date('2026-10-01T09:00:00Z')),
      {
        grade: 'easy',
        now: new Date('2026-10-01T09:00:00Z'),
        cue: 'name',
        exerciseType: 'identify',
        context: 'lesson',
      },
    ).state.due;
    const dueDay = startOfDay(due);
    const beforeDue = new Date(dueDay.getTime() - DAY_MS + 12 * 3600_000).toISOString();
    expect(streak(log, beforeDue)).toMatchObject({ current: 1, today: 'open' });
    // On the due day, before reviewing: still open, streak intact.
    expect(streak(log, new Date(dueDay.getTime() + 3600_000).toISOString())).toMatchObject({
      current: 1,
      today: 'open',
    });
  });

  it('restarts after a day whose due reviews were left undone, but keeps the best', () => {
    const log = logOf([
      [TD, '2026-10-01T09:00:00Z', 'good', 'lesson'],
      [TD, '2026-10-01T09:10:00Z', 'good', 'lesson'],
      [TD, '2026-10-03T09:00:00Z'],
    ]);
    // Day 1 kept (activity). The fact came due later; leaving a due day undone breaks it.
    const after = streak(log, '2026-10-20T12:00:00Z');
    expect(after.best).toBeGreaterThanOrEqual(1);
    expect(after.current).toBe(0);
    expect(after.today).toBe('open');
  });

  it('counts consecutive days where everything due got reviewed', () => {
    const log = logOf([
      [TD, '2026-10-01T09:00:00Z', 'again', 'lesson'],
      [TD, '2026-10-01T09:10:00Z', 'again', 'lesson'],
      [TD, '2026-10-02T09:00:00Z', 'again'],
      [TD, '2026-10-03T09:00:00Z', 'again'],
    ]);
    expect(streak(log, '2026-10-03T12:00:00Z')).toEqual({ current: 3, best: 3, today: 'kept' });
  });
});

describe('ranks', () => {
  it('are gated on mastered facts only', () => {
    expect(rankFor(0)).toMatchObject({
      rank: { title: 'Rookie' },
      next: { title: 'Starter' },
      toNext: 5,
      progress: 0,
    });
    expect(rankFor(4).progress).toBeCloseTo(0.8);
    expect(rankFor(5).rank.title).toBe('Starter');
    expect(rankFor(30)).toMatchObject({ rank: { title: 'Pro Bowl' }, toNext: 70 });
    expect(rankFor(10_000)).toMatchObject({
      rank: { title: 'Hall of Fame' },
      next: null,
      toNext: 0,
      progress: 1,
    });
    expect(rankFor(-3).rank.title).toBe('Rookie');
    expect(RANKS.map((r) => r.minMastered)).toEqual([0, 5, 25, 100, 250]);
  });
});

describe('mastery map', () => {
  it('shows one tile per unit with its facts by level', () => {
    const mastered: UserItemState = {
      ...scheduler.newItemState(TD, new Date()),
      phase: 'review',
      reps: 5,
      stability: 60,
      lastReviewedAt: new Date(),
    };
    const learning = logOf([[FG, '2026-10-01T09:00:00Z']]);
    const states = new Map<ItemId, UserItemState>([
      [TD, mastered],
      [FG, replayStates(scheduler, learning).get(FG)!],
    ]);
    const [section] = masteryMap(content, 'nfl', states, scheduler.config);
    expect(section?.title).toBe('Foundations');
    const tile = section!.tiles[0]!;
    expect(tile.total).toBe(8);
    expect(tile.counts).toEqual({ new: 6, learning: 1, familiar: 0, mastered: 1 });
    expect(tile.mastered).toBeCloseTo(1 / 8);
    expect(masteredCount(content, 'nfl', states, scheduler.config)).toBe(1);
    expect(masteredCount(content, 'nba', states, scheduler.config)).toBe(0);
    expect(masteryMap(content, 'nba', states, scheduler.config)).toEqual([]);
  });
});

describe('saved tips', () => {
  it('adds newest first, removes on a second toggle, and survives bad data', async () => {
    expect(toggled(['a'], 'b')).toEqual(['b', 'a']);
    expect(toggled(['b', 'a'], 'b')).toEqual(['a']);
    const store = new MemoryStore();
    expect(await readSavedTips(store)).toEqual([]);
    expect(await toggleSavedTip(store, 'tip.one')).toEqual(['tip.one']);
    expect(await readSavedTips(store)).toEqual(['tip.one']);
    await store.set(SAVED_TIPS_KEY, '{oops');
    expect(await readSavedTips(store)).toEqual([]);
    await store.set(SAVED_TIPS_KEY, JSON.stringify(['ok', 3]));
    expect(await readSavedTips(store)).toEqual(['ok']);
  });
});
