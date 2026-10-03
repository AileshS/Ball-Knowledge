import { z } from 'zod';
import {
  ExerciseIdSchema,
  hasNoDuplicates,
  ItemIdSchema,
  LessonIdSchema,
  MemoryTipIdSchema,
  TagSchema,
  UnitIdSchema,
} from './ids';

/** PRD §7.4: a lesson is 3–5 minutes and 8–15 interactions. */
export const LESSON_MINUTES = { min: 3, max: 5 } as const;
export const LESSON_INTERACTIONS = { min: 8, max: 15 } as const;

/**
 * A lesson opens with callbacks to earlier material (chosen at runtime from the
 * user's memory state, guided by `callbackHints`), teaches through its exercises,
 * and closes with a recall check on its own content (PRD §7.4).
 */
export const LessonSchema = z
  .object({
    id: LessonIdSchema,
    unitId: UnitIdSchema,
    /** Position on the path within its unit (0 = first). */
    order: z.number().int().nonnegative(),
    title: z.string().trim().min(1),
    estimatedMinutes: z.number().int().min(LESSON_MINUTES.min).max(LESSON_MINUTES.max),
    /** Items this lesson teaches for the first time. */
    introducesItemIds: z.array(ItemIdSchema).min(1, 'A lesson must introduce at least one item'),
    exerciseIds: z.array(ExerciseIdSchema).min(1),
    recallCheckExerciseIds: z
      .array(ExerciseIdSchema)
      .min(1, 'Every lesson closes with a recall check'),
    /** How many callback questions open the lesson. */
    callbackCount: z.number().int().min(0).max(5).default(2),
    /** Tags that make earlier items good callbacks, e.g. the same era or position. */
    callbackHints: z.array(TagSchema).default([]),
    /** Optional mnemonic. Seasoning, not the meal: at most one per lesson. */
    memoryTipIds: z
      .array(MemoryTipIdSchema)
      .max(1, 'At most one memory tip per lesson')
      .default([]),
  })
  .superRefine((lesson, ctx) => {
    const all = [...lesson.exerciseIds, ...lesson.recallCheckExerciseIds];
    if (!hasNoDuplicates(all)) {
      ctx.addIssue({
        code: 'custom',
        path: ['recallCheckExerciseIds'],
        message: 'An exercise may appear only once per lesson (teaching or recall check)',
      });
    }
    if (!hasNoDuplicates(lesson.introducesItemIds)) {
      ctx.addIssue({
        code: 'custom',
        path: ['introducesItemIds'],
        message: 'Introduced items must not repeat',
      });
    }
    const interactions = all.length + lesson.callbackCount;
    if (interactions < LESSON_INTERACTIONS.min || interactions > LESSON_INTERACTIONS.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['exerciseIds'],
        message: `A lesson needs ${LESSON_INTERACTIONS.min}-${LESSON_INTERACTIONS.max} interactions (callbacks + exercises + recall check); this one has ${interactions}`,
      });
    }
  });
export type Lesson = z.infer<typeof LessonSchema>;
