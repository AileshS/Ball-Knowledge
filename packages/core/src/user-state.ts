import { z } from 'zod';
import { CueSchema } from './cue';
import { ExerciseTypeSchema } from './exercise';
import { ItemIdSchema, TimestampSchema } from './ids';

/** What the user sees on each item (PRD §8). Derived from memory state, not stored. */
export const MasteryLevelSchema = z.enum(['new', 'learning', 'familiar', 'mastered']);
export type MasteryLevel = z.infer<typeof MasteryLevelSchema>;

/** Scheduler phase of an item (FSRS card state). */
export const SchedulerPhaseSchema = z.enum(['new', 'learning', 'review', 'relearning']);
export type SchedulerPhase = z.infer<typeof SchedulerPhaseSchema>;

/** How well the user recalled an item, mapped from their answer by the retention engine. */
export const GradeSchema = z.enum(['again', 'hard', 'good', 'easy']);
export type Grade = z.infer<typeof GradeSchema>;

/** Where a review happened; used for analytics such as review completion. */
export const ReviewContextSchema = z.enum(['lesson', 'callback', 'recall_check', 'review']);
export type ReviewContext = z.infer<typeof ReviewContextSchema>;

/** How many recent cues to remember for cue rotation. */
export const CUE_HISTORY_LIMIT = 6;

/**
 * Per-user memory state for one knowledge item. Storage adds the user id; this
 * shape is the same on device and server. Mastery level is derived from it by the
 * retention engine rather than stored, so it can never disagree with the state.
 */
export const UserItemStateSchema = z.object({
  itemId: ItemIdSchema,
  phase: SchedulerPhaseSchema,
  /** FSRS stability in days: the interval at which recall probability falls to ~90%. */
  stability: z.number().nonnegative(),
  /** FSRS difficulty, 1 (easy) to 10 (hard); 0 before the first review. */
  difficulty: z.number().min(0).max(10),
  due: TimestampSchema,
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** Position within the current (re)learning steps. */
  learningSteps: z.number().int().nonnegative(),
  /** Days scheduled at the last review. */
  scheduledDays: z.number().nonnegative(),
  lastReviewedAt: TimestampSchema.optional(),
  /** First time the item was reviewed; the north-star metric measures recall 30+ days later. */
  firstLearnedAt: TimestampSchema.optional(),
  /** Most recent cues first, capped at CUE_HISTORY_LIMIT. */
  cueHistory: z.array(CueSchema).max(CUE_HISTORY_LIMIT).default([]),
});
export type UserItemState = z.infer<typeof UserItemStateSchema>;

/**
 * One answered question. The log is append-only: it feeds analytics (PRD §12) and
 * lets any device rebuild memory state by replaying it (ADR 0003).
 */
export const ReviewLogEntrySchema = z
  .object({
    itemId: ItemIdSchema,
    reviewedAt: TimestampSchema,
    grade: GradeSchema,
    correct: z.boolean(),
    cue: CueSchema,
    exerciseType: ExerciseTypeSchema,
    context: ReviewContextSchema,
    responseMs: z.number().int().nonnegative().optional(),
    /** Days since the item was first learned, for the 30-day recall metric. */
    daysSinceFirstLearned: z.number().nonnegative(),
  })
  .superRefine((entry, ctx) => {
    if (entry.correct === (entry.grade === 'again')) {
      ctx.addIssue({
        code: 'custom',
        path: ['grade'],
        message: 'Grade "again" means incorrect; every other grade means correct',
      });
    }
  });
export type ReviewLogEntry = z.infer<typeof ReviewLogEntrySchema>;
