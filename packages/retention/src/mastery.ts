import type { MasteryLevel, UserItemState } from '@ball-knowledge/core';
import { DEFAULT_RETENTION_CONFIG, type RetentionConfig } from './config';
import type { Scheduler } from './scheduler';

/** Mastery levels from least to most known. */
export const MASTERY_ORDER: readonly MasteryLevel[] = ['new', 'learning', 'familiar', 'mastered'];

/**
 * The mastery level shown to the user (PRD §8: New → Learning → Familiar → Mastered),
 * derived from memory state so it can never disagree with the scheduler.
 */
export function masteryLevel(
  state: UserItemState,
  config: RetentionConfig = DEFAULT_RETENTION_CONFIG,
): MasteryLevel {
  if (state.phase === 'new' || state.reps === 0) return 'new';
  if (state.phase === 'learning' || state.phase === 'relearning') return 'learning';
  const { familiarStabilityDays, masteredStabilityDays, masteredMinReviews } = config.mastery;
  if (state.stability >= masteredStabilityDays && state.reps >= masteredMinReviews) {
    return 'mastered';
  }
  if (state.stability >= familiarStabilityDays) return 'familiar';
  return 'learning';
}

/**
 * True when a learned item's predicted recall has dropped below the fading
 * threshold, so the UI can flag it and review can bring it back (PRD §8).
 */
export function isFading(scheduler: Scheduler, state: UserItemState, now: Date): boolean {
  if (state.phase === 'new') return false;
  return scheduler.retrievability(state, now) < scheduler.config.fadingRetrievability;
}

export interface UnitHealth {
  readonly total: number;
  readonly learned: number;
  readonly mastered: number;
  readonly fading: number;
  /** Mean predicted recall across learned items (0 when nothing is learned yet). */
  readonly averageRetrievability: number;
  /** The unit has "faded" and should be offered as a refresh (PRD §8). */
  readonly needsRefresh: boolean;
}

/** Summarizes a unit's items for the learning path and mastery map. */
export function unitHealth(
  scheduler: Scheduler,
  states: Iterable<UserItemState>,
  now: Date,
): UnitHealth {
  let total = 0;
  let learned = 0;
  let mastered = 0;
  let fading = 0;
  let recallSum = 0;
  for (const state of states) {
    total += 1;
    if (state.phase === 'new') continue;
    learned += 1;
    recallSum += scheduler.retrievability(state, now);
    if (masteryLevel(state, scheduler.config) === 'mastered') mastered += 1;
    if (isFading(scheduler, state, now)) fading += 1;
  }
  return {
    total,
    learned,
    mastered,
    fading,
    averageRetrievability: learned === 0 ? 0 : recallSum / learned,
    needsRefresh: learned > 0 && fading / learned >= scheduler.config.unitRefreshShare,
  };
}
