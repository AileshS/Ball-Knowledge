import { describe, expect, it } from 'vitest';
import {
  CUE_HISTORY_LIMIT,
  ReviewLogEntrySchema,
  UserItemStateSchema,
  validate,
} from '../src/index';
import { reviewLogEntryInput, userItemStateInput } from '../src/testing';

describe('UserItemStateSchema', () => {
  it('parses stored JSON into Dates', () => {
    const state = UserItemStateSchema.parse(userItemStateInput());
    expect(state.due).toBeInstanceOf(Date);
    expect(state.lastReviewedAt).toBeInstanceOf(Date);
  });

  it('defaults cue history for brand-new items', () => {
    const state = UserItemStateSchema.parse(
      userItemStateInput({
        phase: 'new',
        stability: 0,
        difficulty: 0,
        reps: 0,
        scheduledDays: 0,
        lastReviewedAt: undefined,
        firstLearnedAt: undefined,
        cueHistory: undefined,
      }),
    );
    expect(state.cueHistory).toEqual([]);
  });

  it('rejects impossible values', () => {
    const result = validate(
      UserItemStateSchema,
      userItemStateInput({ stability: -1, difficulty: 11, reps: 1.5 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.split(':')[0])).toEqual([
        'stability',
        'difficulty',
        'reps',
      ]);
    }
  });

  it('caps cue history', () => {
    const cueHistory = Array.from({ length: CUE_HISTORY_LIMIT + 1 }, () => 'name' as const);
    expect(validate(UserItemStateSchema, userItemStateInput({ cueHistory })).ok).toBe(false);
  });
});

describe('ReviewLogEntrySchema', () => {
  it('accepts a correct answer', () => {
    expect(validate(ReviewLogEntrySchema, reviewLogEntryInput()).ok).toBe(true);
  });

  it('keeps grade and correctness consistent', () => {
    const wrongButGood = validate(ReviewLogEntrySchema, reviewLogEntryInput({ correct: false }));
    expect(wrongButGood.ok).toBe(false);
    const rightButAgain = validate(ReviewLogEntrySchema, reviewLogEntryInput({ grade: 'again' }));
    expect(rightButAgain.ok).toBe(false);
    const missed = validate(
      ReviewLogEntrySchema,
      reviewLogEntryInput({ grade: 'again', correct: false }),
    );
    expect(missed.ok).toBe(true);
  });
});
