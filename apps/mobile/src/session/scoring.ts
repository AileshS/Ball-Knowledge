import type { Exercise, Grade, ItemId, UserItemState } from '@ball-knowledge/core';
import {
  gradeAnswer,
  tipsForRetry,
  type ReviewResult,
  type Scheduler,
} from '@ball-knowledge/retention';
import type { AppContent } from '../content/bundle';
import { PHASE_CONTEXT, type QuestionStep } from './plan';

export interface AnswerOutcome {
  readonly correct: boolean;
  /** Accepted with a spelling slip: counts as correct, graded Hard. */
  readonly typo?: boolean;
  readonly responseMs?: number;
}

export interface Scored {
  readonly grade: Grade;
  /** One per tested item: the new state plus the log entry to append. */
  readonly results: readonly ReviewResult[];
}

/**
 * Applies one answer to every item the question tests. Typed answers count as
 * production (eligible for Easy); everything else is recognition.
 */
export function scoreAnswer(
  scheduler: Scheduler,
  states: ReadonlyMap<ItemId, UserItemState>,
  step: QuestionStep,
  exercise: Exercise,
  outcome: AnswerOutcome,
  now: Date,
): Scored {
  const grade = gradeAnswer(
    {
      correct: outcome.correct,
      mode: step.format === 'typed' ? 'production' : 'recognition',
      usedHint: outcome.typo === true,
      ...(outcome.responseMs === undefined ? {} : { responseMs: outcome.responseMs }),
    },
    scheduler.config,
  );
  const results = step.itemIds.map((itemId) => {
    const previous = states.get(itemId) ?? scheduler.newItemState(itemId, now);
    // A synced answer from a device whose clock runs fast can be "in the future".
    // Never time-stamp at or before the item's last review: reviews stay in order,
    // and each answer keeps a distinct sync id (item + time).
    const last = previous.lastReviewedAt?.getTime() ?? -Infinity;
    const at = now.getTime() > last ? now : new Date(last + 1);
    return scheduler.applyReview(previous, {
      grade,
      now: at,
      cue: exercise.cue,
      exerciseType: exercise.type,
      context: PHASE_CONTEXT[step.phase],
      ...(outcome.responseMs === undefined ? {} : { responseMs: outcome.responseMs }),
    });
  });
  return { grade, results };
}

export interface Feedback {
  readonly correct: boolean;
  /** The right answer, shown after a miss. */
  readonly answer: string;
  /** "Why it matters" lines for the tested items: the story that makes it stick. */
  readonly why: readonly string[];
  /** Memory tips to see before trying again (PRD §8), only after a miss. */
  readonly tips: readonly { readonly title: string; readonly body: string }[];
}

/** The text a question's correct answer is shown as. */
export function correctAnswerText(exercise: Exercise): string {
  switch (exercise.type) {
    case 'match':
      return exercise.pairs.map((p) => `${p.left} → ${p.right}`).join('\n');
    case 'timeline_order':
      return exercise.events.map((e, i) => `${i + 1}. ${e.label}`).join('\n');
    case 'higher_lower':
      return (
        exercise.explanation ??
        (exercise.higher === 'left' ? exercise.left.label : exercise.right.label)
      );
    default:
      return exercise.answer;
  }
}

export function feedbackFor(content: AppContent, exercise: Exercise, correct: boolean): Feedback {
  const tips = correct
    ? []
    : exercise.itemIds
        .flatMap((id) => tipsForRetry(id, false, content.tips))
        .filter((tip, i, all) => all.findIndex((t) => t.id === tip.id) === i)
        .map((t) => ({ title: t.title, body: t.body }));
  return {
    correct,
    answer: correctAnswerText(exercise),
    why: exercise.itemIds
      .map((id) => content.itemsById.get(id)?.whyItMatters ?? '')
      .filter(Boolean),
    tips,
  };
}
