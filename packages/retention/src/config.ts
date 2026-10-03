/** A short-term step such as `10m`, `1h` or `1d`. */
export type Step = `${number}${'m' | 'h' | 'd'}`;

/**
 * Every tunable number in the retention engine lives here, so behavior can be
 * reasoned about (and simulated) in one place. Defaults are documented choices,
 * not facts: revisit them with real review logs.
 */
export interface RetentionConfig {
  /** Probability of recall the scheduler aims for when an item comes due (FSRS). */
  readonly desiredRetention: number;
  /**
   * Longest gap between reviews. Capped at a year so a name the user has learned
   * keeps coming back (CLAUDE.md principle 3).
   */
  readonly maximumIntervalDays: number;
  /** Short-term steps for new items: e.g. first answer in a lesson, then the recall check. */
  readonly learningSteps: readonly Step[];
  /** Short-term steps after a miss: the item is asked again later in the same session. */
  readonly relearningSteps: readonly Step[];
  readonly mastery: {
    /** FSRS stability (days until recall falls to ~90%) at which an item is Familiar. */
    readonly familiarStabilityDays: number;
    /**
     * Stability at which an item is Mastered. At 30 days, the model predicts ~90%
     * recall a month out, above the PRD's day-30 target of 80%.
     */
    readonly masteredStabilityDays: number;
    /** Minimum reviews before an item can be Mastered, so one lucky answer can't get there. */
    readonly masteredMinReviews: number;
  };
  /** Below this predicted recall a learned item counts as fading (PRD §8: decay is visible). */
  readonly fadingRetrievability: number;
  /** A unit needs a refresh when at least this share of its learned items is fading. */
  readonly unitRefreshShare: number;
  /**
   * Most reviews in one day's plan, so the daily goal stays finishable (PRD §9).
   * At ~10–15 s per review this is roughly a 10-minute session.
   */
  readonly maxDailyReviews: number;
  readonly grading: {
    /** Correct answers slower than this are graded Hard. */
    readonly slowResponseMs: number;
    /** Typed (production) answers faster than this are graded Easy. */
    readonly fastResponseMs: number;
  };
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  desiredRetention: 0.9,
  maximumIntervalDays: 365,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
  mastery: {
    familiarStabilityDays: 7,
    masteredStabilityDays: 30,
    masteredMinReviews: 3,
  },
  fadingRetrievability: 0.85,
  unitRefreshShare: 0.25,
  maxDailyReviews: 50,
  grading: {
    slowResponseMs: 15_000,
    fastResponseMs: 5_000,
  },
};

export const DAY_MS = 86_400_000;
