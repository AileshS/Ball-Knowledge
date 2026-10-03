import {
  CUE_HISTORY_LIMIT,
  type Cue,
  type ExerciseType,
  type Grade,
  type ItemId,
  type ReviewContext,
  type ReviewLogEntry,
  type SchedulerPhase,
  type UserItemState,
} from '@ball-knowledge/core';
// ts-fsrs 5.x patches four deprecated helpers onto Date.prototype when imported
// (removed in 6.0). We never call them; upgrade once 6.0 is stable. The library
// stays behind this module so it can be swapped without touching callers.
import { forgetting_curve, fsrs, Rating, State, type Card, type Grade as FsrsGrade } from 'ts-fsrs';
import { DAY_MS, DEFAULT_RETENTION_CONFIG, type RetentionConfig } from './config';

const PHASE_TO_STATE: Record<SchedulerPhase, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_TO_PHASE: Record<State, SchedulerPhase> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const GRADE_TO_RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export interface ReviewInput {
  readonly grade: Grade;
  readonly now: Date;
  readonly cue: Cue;
  readonly exerciseType: ExerciseType;
  readonly context: ReviewContext;
  readonly responseMs?: number;
}

export interface ReviewResult {
  readonly state: UserItemState;
  readonly logEntry: ReviewLogEntry;
}

export interface Scheduler {
  readonly config: RetentionConfig;
  /** Memory state for an item the user hasn't seen yet. */
  newItemState(itemId: ItemId, now: Date): UserItemState;
  /** Applies one answer and returns the next state plus the review-log entry to append. */
  applyReview(state: UserItemState, review: ReviewInput): ReviewResult;
  /** Predicted probability (0–1) that the user recalls the item at `now`; 0 if never learned. */
  retrievability(state: UserItemState, now: Date): number;
}

const daysBetween = (later: Date, earlier: Date) => (later.getTime() - earlier.getTime()) / DAY_MS;

/**
 * Timers often report fractional or (with clock adjustments) negative durations.
 * The log stores whole, non-negative milliseconds so every entry stays valid for
 * replay (ADR 0003); unusable values are left out rather than guessed.
 */
function responseMsField(responseMs: number | undefined): { responseMs?: number } {
  if (responseMs === undefined || !Number.isFinite(responseMs)) return {};
  return { responseMs: Math.max(0, Math.round(responseMs)) };
}

function assertValidTime(now: Date): void {
  if (Number.isNaN(now.getTime())) throw new RangeError('Review time must be a valid Date');
}

/**
 * The single place spaced-repetition scheduling happens (FSRS via ts-fsrs). Pure:
 * time is always passed in, fuzz is off, and the same inputs give the same outputs,
 * so any device can rebuild state by replaying the review log (ADR 0003).
 */
export function createScheduler(config: RetentionConfig = DEFAULT_RETENTION_CONFIG): Scheduler {
  const engine = fsrs({
    request_retention: config.desiredRetention,
    maximum_interval: config.maximumIntervalDays,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: [...config.learningSteps],
    relearning_steps: [...config.relearningSteps],
  });
  const weights = engine.parameters.w;

  const toCard = (state: UserItemState, now: Date): Card => ({
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.lastReviewedAt
      ? Math.max(0, Math.floor(daysBetween(now, state.lastReviewedAt)))
      : 0,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: PHASE_TO_STATE[state.phase],
    last_review: state.lastReviewedAt,
  });

  return {
    config,

    newItemState(itemId, now) {
      assertValidTime(now);
      return {
        itemId,
        phase: 'new',
        stability: 0,
        difficulty: 0,
        due: new Date(now.getTime()),
        reps: 0,
        lapses: 0,
        learningSteps: 0,
        scheduledDays: 0,
        cueHistory: [],
      };
    },

    applyReview(state, review) {
      const now = new Date(review.now.getTime());
      assertValidTime(now);
      if (state.lastReviewedAt && now.getTime() < state.lastReviewedAt.getTime()) {
        throw new RangeError('Reviews must be applied in chronological order');
      }

      const { card } = engine.next(toCard(state, now), now, GRADE_TO_RATING[review.grade]);
      const firstLearnedAt = state.firstLearnedAt ?? now;

      const next: UserItemState = {
        itemId: state.itemId,
        phase: STATE_TO_PHASE[card.state],
        stability: card.stability,
        difficulty: card.difficulty,
        due: new Date(card.due.getTime()),
        reps: card.reps,
        lapses: card.lapses,
        learningSteps: card.learning_steps,
        scheduledDays: card.scheduled_days,
        lastReviewedAt: now,
        firstLearnedAt,
        cueHistory: [review.cue, ...state.cueHistory].slice(0, CUE_HISTORY_LIMIT),
      };

      const logEntry: ReviewLogEntry = {
        itemId: state.itemId,
        reviewedAt: now,
        grade: review.grade,
        correct: review.grade !== 'again',
        cue: review.cue,
        exerciseType: review.exerciseType,
        context: review.context,
        ...responseMsField(review.responseMs),
        daysSinceFirstLearned: daysBetween(now, firstLearnedAt),
      };

      return { state: next, logEntry };
    },

    retrievability(state, now) {
      if (state.phase === 'new' || !state.lastReviewedAt || state.stability <= 0) return 0;
      const elapsed = Math.max(0, daysBetween(now, state.lastReviewedAt));
      return forgetting_curve(weights, elapsed, state.stability);
    },
  };
}
