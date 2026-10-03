import {
  MEDIA_CUES,
  supportsTypedRecall,
  type Cue,
  type ExerciseType,
  type MasteryLevel,
} from '@ball-knowledge/core';

export interface CueOptions {
  /**
   * Photo and clip cues stay off until media is licensed (ADR 0005). When an item
   * only has media cues, they're used anyway; the exercise's text fallback covers it.
   */
  readonly allowMediaCues?: boolean;
}

/**
 * Picks the cue to test an item through next: the one used least recently, so
 * recall doesn't depend on a single prompt (PRD §8: varied cues).
 * `history` is most-recent-first, as stored in `UserItemState.cueHistory`.
 */
export function nextCue(
  available: readonly Cue[],
  history: readonly Cue[],
  options: CueOptions = {},
): Cue {
  const textOnly = available.filter((c) => !MEDIA_CUES.has(c));
  const pool = options.allowMediaCues || textOnly.length === 0 ? available : textOnly;
  if (pool.length === 0) throw new RangeError('An item needs at least one cue');

  const lastUsed = (cue: Cue) => {
    const index = history.indexOf(cue);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  // Highest index = longest ago; never-used cues win. Ties keep the authored order.
  return pool.reduce((best, cue) => (lastUsed(cue) > lastUsed(best) ? cue : best));
}

/** How an exercise is presented to the user. */
export type ExerciseFormat = 'recognition' | 'production' | 'structured';

/**
 * Active recall over recognition (PRD §8): new and learning items are asked as
 * recognition (pick from options); familiar and mastered items must be produced
 * (typed). Matching, timelines and comparisons keep their own structured format.
 */
export function exerciseFormat(mastery: MasteryLevel, exerciseType: ExerciseType): ExerciseFormat {
  if (!supportsTypedRecall(exerciseType)) return 'structured';
  return mastery === 'familiar' || mastery === 'mastered' ? 'production' : 'recognition';
}
