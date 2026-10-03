import { CUE_HISTORY_LIMIT, ReviewLogEntrySchema, UserItemStateSchema } from '@ball-knowledge/core';
import { describe, expect, it } from 'vitest';
import { createScheduler, DEFAULT_RETENTION_CONFIG } from '../src/index';
import { addDays, addMinutes, itemId, learnInLesson, review, T0 } from './helpers';

const scheduler = createScheduler();

describe('createScheduler', () => {
  it('starts items as new and due now', () => {
    const state = scheduler.newItemState(itemId(1), T0);
    expect(state).toMatchObject({ phase: 'new', reps: 0, lapses: 0, stability: 0 });
    expect(state.due.getTime()).toBe(T0.getTime());
    expect(state.due).not.toBe(T0); // copied, so callers can't mutate it by accident
    expect(UserItemStateSchema.safeParse(state).success).toBe(true);
  });

  it('keeps a newly answered item in short-term learning', () => {
    const state = review(scheduler, scheduler.newItemState(itemId(1), T0), 'good', T0);
    expect(state.phase).toBe('learning');
    expect(state.due.getTime()).toBeGreaterThan(T0.getTime());
    expect(state.due.getTime()).toBeLessThan(addDays(T0, 1).getTime());
  });

  it('graduates an item to day-scale review after a lesson and its recall check', () => {
    const state = learnInLesson(scheduler, itemId(1), T0);
    expect(state.phase).toBe('review');
    expect(state.due.getTime()).toBeGreaterThanOrEqual(addDays(T0, 1).getTime());
  });

  it('records a lapse and relearns soon after a miss', () => {
    const learned = learnInLesson(scheduler, itemId(1), T0);
    const missed = review(scheduler, learned, 'again', learned.due);
    expect(missed.phase).toBe('relearning');
    expect(missed.lapses).toBe(learned.lapses + 1);
    expect(missed.due.getTime()).toBeLessThan(addMinutes(learned.due, 61).getTime());
    expect(missed.stability).toBeLessThan(learned.stability);
  });

  it('writes a review-log entry that the core schema accepts', () => {
    const first = scheduler.applyReview(scheduler.newItemState(itemId(1), T0), {
      grade: 'again',
      now: T0,
      cue: 'jersey',
      exerciseType: 'identify',
      context: 'lesson',
      responseMs: 3_100,
    });
    expect(first.logEntry).toMatchObject({
      itemId: itemId(1),
      grade: 'again',
      correct: false,
      cue: 'jersey',
      exerciseType: 'identify',
      context: 'lesson',
      responseMs: 3_100,
      daysSinceFirstLearned: 0,
    });
    expect(ReviewLogEntrySchema.safeParse(first.logEntry).success).toBe(true);

    const later = scheduler.applyReview(first.state, {
      grade: 'good',
      now: addDays(T0, 2),
      cue: 'name',
      exerciseType: 'fill_blank',
      context: 'review',
    });
    expect(later.logEntry.daysSinceFirstLearned).toBe(2);
    expect(later.logEntry.correct).toBe(true);
    expect(later.logEntry).not.toHaveProperty('responseMs');
    expect(later.state.firstLearnedAt?.getTime()).toBe(T0.getTime());
    expect(UserItemStateSchema.safeParse(later.state).success).toBe(true);
  });

  it('stores response times as whole, non-negative ms so the log stays replayable', () => {
    const logFor = (responseMs: number) =>
      scheduler.applyReview(scheduler.newItemState(itemId(1), T0), {
        grade: 'good',
        now: T0,
        cue: 'name',
        exerciseType: 'multiple_choice',
        context: 'lesson',
        responseMs,
      }).logEntry;
    expect(logFor(1834.7).responseMs).toBe(1835);
    expect(logFor(-12).responseMs).toBe(0);
    expect(logFor(Number.NaN)).not.toHaveProperty('responseMs');
    for (const ms of [1834.7, -12, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ReviewLogEntrySchema.safeParse(logFor(ms)).success).toBe(true);
    }
  });

  it('keeps the most recent cues first, capped', () => {
    let state = scheduler.newItemState(itemId(1), T0);
    const cues = ['name', 'jersey', 'stat', 'timeline', 'name', 'jersey', 'stat', 'name'] as const;
    cues.forEach((cue, i) => {
      state = scheduler.applyReview(state, {
        grade: 'good',
        now: addDays(T0, i),
        cue,
        exerciseType: 'multiple_choice',
        context: 'review',
      }).state;
    });
    expect(state.cueHistory).toHaveLength(CUE_HISTORY_LIMIT);
    expect(state.cueHistory[0]).toBe('name');
    expect(state.cueHistory[1]).toBe('stat');
  });

  it('rejects reviews out of chronological order and invalid times', () => {
    const learned = learnInLesson(scheduler, itemId(1), T0);
    expect(() => review(scheduler, learned, 'good', addDays(T0, -1))).toThrow(RangeError);
    expect(() => review(scheduler, learned, 'good', new Date(Number.NaN))).toThrow(RangeError);
    expect(() => scheduler.newItemState(itemId(2), new Date(Number.NaN))).toThrow(RangeError);
  });

  it('does not mutate the state it is given', () => {
    const learned = learnInLesson(scheduler, itemId(1), T0);
    const snapshot = structuredClone(learned);
    review(scheduler, Object.freeze(learned), 'again', learned.due);
    expect(learned).toEqual(snapshot);
  });

  it('is deterministic', () => {
    const run = () =>
      review(scheduler, learnInLesson(scheduler, itemId(1), T0), 'hard', addDays(T0, 3));
    expect(run()).toEqual(run());
  });

  describe('retrievability', () => {
    it('is 0 for items never learned', () => {
      expect(scheduler.retrievability(scheduler.newItemState(itemId(1), T0), T0)).toBe(0);
    });

    it('is about the desired retention when an item comes due, and falls after', () => {
      const learned = learnInLesson(scheduler, itemId(1), T0);
      const mature = review(
        scheduler,
        review(scheduler, learned, 'good', learned.due),
        'good',
        addDays(learned.due, 5),
      );
      const atDue = scheduler.retrievability(mature, mature.due);
      expect(atDue).toBeGreaterThan(DEFAULT_RETENTION_CONFIG.desiredRetention - 0.05);
      expect(atDue).toBeLessThan(DEFAULT_RETENTION_CONFIG.desiredRetention + 0.05);
      expect(scheduler.retrievability(mature, addDays(mature.due, 30))).toBeLessThan(atDue);
      expect(scheduler.retrievability(mature, mature.lastReviewedAt!)).toBeCloseTo(1, 5);
    });
  });

  it('honors a custom desired retention', () => {
    const strict = createScheduler({ ...DEFAULT_RETENTION_CONFIG, desiredRetention: 0.95 });
    const learned = learnInLesson(scheduler, itemId(1), T0);
    const loose = review(scheduler, learned, 'good', learned.due);
    const tight = review(strict, learnInLesson(strict, itemId(1), T0), 'good', learned.due);
    expect(tight.scheduledDays).toBeLessThan(loose.scheduledDays);
  });
});
