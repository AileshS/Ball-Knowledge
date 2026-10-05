import type { Exercise, ItemId, UserItemState } from '@ball-knowledge/core';
import type { ReviewResult, Rng, Scheduler } from '@ball-knowledge/retention';
import type { AppContent } from '../content/bundle';
import { exerciseForItem, questionFor, type QuestionStep } from './plan';

/** Keeps the quiz short (PRD §6: "short onboarding quiz"). */
export const MAX_PLACEMENT_QUESTIONS = 12;

export interface PlacementPlan {
  readonly steps: readonly QuestionStep[];
  /** Lessons the quiz fully covers, in path order: each can be placed out of. */
  readonly lessonIds: readonly string[];
  /** Which lesson each asked fact belongs to. */
  readonly lessonOf: ReadonlyMap<ItemId, string>;
}

export interface PlacementInput {
  readonly content: AppContent;
  readonly sportId: string;
  readonly states: ReadonlyMap<ItemId, UserItemState>;
  readonly completedLessonIds: ReadonlySet<string>;
  readonly scheduler: Scheduler;
  readonly rng: Rng;
  readonly maxQuestions?: number;
}

/**
 * A short placement quiz over the sport's Foundations (PRD §7.1: "skippable via
 * placement"): one typed question per fact, whole lessons at a time, in path
 * order, up to the cap. Lessons already completed are skipped.
 */
export function planPlacement(input: PlacementInput): PlacementPlan {
  const { content, sportId, states, completedLessonIds, scheduler, rng } = input;
  const max = input.maxQuestions ?? MAX_PLACEMENT_QUESTIONS;
  const units = content.units
    .filter((u) => u.sportId === sportId && u.track === 'foundations')
    .sort((a, b) => a.order - b.order);

  const steps: QuestionStep[] = [];
  const lessonIds: string[] = [];
  const lessonOf = new Map<ItemId, string>();

  for (const unit of units) {
    const lessons = content.lessons
      .filter((l) => l.unitId === unit.id && !completedLessonIds.has(l.id))
      .sort((a, b) => a.order - b.order);
    for (const lesson of lessons) {
      if (steps.length + lesson.introducesItemIds.length > max) {
        return { steps, lessonIds, lessonOf };
      }
      const recallChecks = lesson.recallCheckExerciseIds
        .map((id) => content.exercisesById.get(id))
        .filter((e): e is Exercise => e !== undefined);
      const questions: QuestionStep[] = [];
      for (const itemId of lesson.introducesItemIds) {
        // Prefer the lesson's own recall check for this fact, then any single-fact exercise.
        const exercise =
          recallChecks.find((e) => e.itemIds.length === 1 && e.itemIds[0] === itemId) ??
          exerciseForItem(content, itemId, states.get(itemId));
        if (!exercise || exercise.itemIds.length !== 1) break;
        questions.push(
          questionFor(exercise, 'placement', states, scheduler, rng, `placement:${itemId}`),
        );
      }
      // Only whole lessons can be placed out of.
      if (questions.length !== lesson.introducesItemIds.length) continue;
      steps.push(...questions);
      lessonIds.push(lesson.id);
      for (const itemId of lesson.introducesItemIds) lessonOf.set(itemId, lesson.id);
    }
  }
  return { steps, lessonIds, lessonOf };
}

/**
 * A correct placement answer means the fact is already known, so it's graded Easy
 * (a long first interval). A wrong answer changes nothing: the lesson will teach
 * the fact normally.
 */
export function scorePlacement(
  scheduler: Scheduler,
  states: ReadonlyMap<ItemId, UserItemState>,
  step: QuestionStep,
  exercise: Exercise,
  correct: boolean,
  now: Date,
): ReviewResult[] {
  if (!correct) return [];
  return step.itemIds.map((itemId) =>
    scheduler.applyReview(states.get(itemId) ?? scheduler.newItemState(itemId, now), {
      grade: 'easy',
      now,
      cue: exercise.cue,
      exerciseType: exercise.type,
      context: 'placement',
    }),
  );
}

/** Lessons placed out of: every fact in them was answered correctly. */
export function placedLessons(
  plan: PlacementPlan,
  correctByItem: ReadonlyMap<ItemId, boolean>,
): string[] {
  return plan.lessonIds.filter((lessonId) =>
    [...plan.lessonOf]
      .filter(([, lesson]) => lesson === lessonId)
      .every(([itemId]) => correctByItem.get(itemId) === true),
  );
}
