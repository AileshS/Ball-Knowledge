import { z } from 'zod';
import { normalizeAnswer } from './answer-text';
import { CueSchema, MEDIA_CUES } from './cue';
import { ExerciseIdSchema, hasNoDuplicates, ItemIdSchema } from './ids';

/** Exercise types from PRD §7.4. */
export const ExerciseTypeSchema = z.enum([
  'multiple_choice',
  'identify',
  'match',
  'timeline_order',
  'higher_lower',
  'who_did_it',
  'fill_blank',
  'clip',
]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

const text = z.string().trim().min(1);

const base = {
  id: ExerciseIdSchema,
  /** The knowledge items this exercise tests (its result updates their memory state). */
  itemIds: z.array(ItemIdSchema).min(1, 'An exercise must test at least one item'),
  cue: CueSchema,
  prompt: text,
  /** Text-only version of the exercise for when media can't be shown (ADR 0005). */
  textFallback: text.optional(),
  /** Fictional test data. Never allowed in a shipping content bundle. */
  fixture: z.boolean().optional(),
};

/**
 * Answer shape for exercises that can be shown as recognition (pick from options)
 * or production (type the answer). The retention engine chooses which, based on
 * the item's mastery (PRD §8: active recall over recognition as items mature).
 */
const recall = {
  answer: text,
  /** Other accepted typed answers, e.g. a common nickname or spelling. */
  acceptedAnswers: z.array(text).default([]),
  /** Wrong options shown in recognition mode. */
  distractors: z.array(text).default([]),
};

export const MultipleChoiceExerciseSchema = z.object({
  ...base,
  ...recall,
  type: z.literal('multiple_choice'),
});
export const IdentifyExerciseSchema = z.object({ ...base, ...recall, type: z.literal('identify') });
export const WhoDidItExerciseSchema = z.object({
  ...base,
  ...recall,
  type: z.literal('who_did_it'),
});
export const FillBlankExerciseSchema = z.object({
  ...base,
  ...recall,
  type: z.literal('fill_blank'),
});
export const ClipExerciseSchema = z.object({
  ...base,
  ...recall,
  type: z.literal('clip'),
  clip: z.object({
    /** Official or licensed embed only; never re-hosted (ADR 0005). */
    embedUrl: z.url({ protocol: /^https$/, error: 'Clip embedUrl must be an https URL' }),
    sourceName: text,
  }),
});
export const MatchExerciseSchema = z.object({
  ...base,
  type: z.literal('match'),
  pairs: z.array(z.object({ left: text, right: text })).min(2, 'A match needs at least 2 pairs'),
});
export const TimelineOrderExerciseSchema = z.object({
  ...base,
  type: z.literal('timeline_order'),
  /** Events in their correct chronological order; the app shuffles them. */
  events: z
    .array(z.object({ label: text, itemId: ItemIdSchema.optional() }))
    .min(3, 'A timeline needs at least 3 events'),
});
export const HigherLowerExerciseSchema = z.object({
  ...base,
  type: z.literal('higher_lower'),
  metric: text,
  left: z.object({ label: text }),
  right: z.object({ label: text }),
  higher: z.enum(['left', 'right']),
  /** Shown after answering, so the comparison teaches something. */
  explanation: text.optional(),
});

const RECALL_TYPES: ReadonlySet<ExerciseType> = new Set<ExerciseType>([
  'multiple_choice',
  'identify',
  'who_did_it',
  'fill_blank',
  'clip',
]);

/** True for exercise types that can be played as recognition or typed recall. */
export function supportsTypedRecall(type: ExerciseType): boolean {
  return RECALL_TYPES.has(type);
}

// Same comparison the app uses when grading, so "distinct" here means distinct there too.
const normalize = normalizeAnswer;

export const ExerciseSchema = z
  .discriminatedUnion('type', [
    MultipleChoiceExerciseSchema,
    IdentifyExerciseSchema,
    WhoDidItExerciseSchema,
    FillBlankExerciseSchema,
    ClipExerciseSchema,
    MatchExerciseSchema,
    TimelineOrderExerciseSchema,
    HigherLowerExerciseSchema,
  ])
  .superRefine((ex, ctx) => {
    if (!hasNoDuplicates(ex.itemIds)) {
      ctx.addIssue({ code: 'custom', path: ['itemIds'], message: 'Item ids must not repeat' });
    }
    if (MEDIA_CUES.has(ex.cue) && !ex.textFallback) {
      ctx.addIssue({
        code: 'custom',
        path: ['textFallback'],
        message: `A "${ex.cue}" cue requires a textFallback (ADR 0005: text-first)`,
      });
    }
    if (ex.type === 'clip' && ex.cue !== 'clip') {
      ctx.addIssue({
        code: 'custom',
        path: ['cue'],
        message: 'Clip exercises must use the clip cue',
      });
    }

    switch (ex.type) {
      case 'multiple_choice':
      case 'identify':
      case 'who_did_it':
      case 'fill_blank':
      case 'clip': {
        // A wrong option must never also be a right answer, or recognition and typed
        // modes would grade the same response differently.
        const correct = new Set([ex.answer, ...ex.acceptedAnswers].map(normalize));
        const distractors = ex.distractors.map(normalize);
        if (distractors.some((d) => correct.has(d))) {
          ctx.addIssue({
            code: 'custom',
            path: ['distractors'],
            message: 'Distractors must not match the answer or an accepted answer',
          });
        }
        if (!hasNoDuplicates(distractors)) {
          ctx.addIssue({
            code: 'custom',
            path: ['distractors'],
            message: 'Distractors must be unique',
          });
        }
        if (ex.type === 'multiple_choice' && ex.distractors.length < 2) {
          ctx.addIssue({
            code: 'custom',
            path: ['distractors'],
            message: 'Multiple choice needs at least 2 distractors',
          });
        }
        if (ex.type === 'fill_blank' && !ex.prompt.includes('___')) {
          ctx.addIssue({
            code: 'custom',
            path: ['prompt'],
            message: 'Fill-in-the-blank prompts must mark the blank with "___"',
          });
        }
        break;
      }
      case 'match': {
        const lefts = ex.pairs.map((p) => normalize(p.left));
        const rights = ex.pairs.map((p) => normalize(p.right));
        if (!hasNoDuplicates(lefts) || !hasNoDuplicates(rights)) {
          ctx.addIssue({ code: 'custom', path: ['pairs'], message: 'Match sides must be unique' });
        }
        break;
      }
      case 'timeline_order': {
        if (!hasNoDuplicates(ex.events.map((e) => normalize(e.label)))) {
          ctx.addIssue({
            code: 'custom',
            path: ['events'],
            message: 'Timeline events must be unique',
          });
        }
        // Answers update memory state only for tested items, so any item an event
        // names must be one of them.
        const tested = new Set<string>(ex.itemIds);
        ex.events.forEach((event, i) => {
          if (event.itemId !== undefined && !tested.has(event.itemId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['events', i, 'itemId'],
              message: `Event item "${event.itemId}" must also be listed in itemIds`,
            });
          }
        });
        break;
      }
      case 'higher_lower': {
        if (normalize(ex.left.label) === normalize(ex.right.label)) {
          ctx.addIssue({
            code: 'custom',
            path: ['right'],
            message: 'Higher-or-lower needs two different sides',
          });
        }
        break;
      }
    }
  });
export type Exercise = z.infer<typeof ExerciseSchema>;
