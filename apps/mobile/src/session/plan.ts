import {
  supportsTypedRecall,
  type Exercise,
  type ItemId,
  type Lesson,
  type MemoryTechnique,
  type ReviewContext,
  type UserItemState,
} from '@ball-knowledge/core';
import {
  exerciseFormat,
  masteryLevel,
  nextCue,
  pickCallbacks,
  type Rng,
  type Scheduler,
} from '@ball-knowledge/retention';
import type { AppContent } from '../content/bundle';

/** Where a question sits in a session; maps to the review log's context. */
export type QuestionPhase = 'callback' | 'learn' | 'recall' | 'review' | 'placement';

export const PHASE_CONTEXT: Readonly<Record<QuestionPhase, ReviewContext>> = {
  callback: 'callback',
  learn: 'lesson',
  recall: 'recall_check',
  review: 'review',
  placement: 'placement',
};

/** How the question is answered on screen. */
export type QuestionFormat = 'choice' | 'typed' | 'match' | 'timeline' | 'higher_lower';

export interface LearnStep {
  readonly kind: 'learn';
  readonly itemId: ItemId;
  readonly label: string;
  readonly statement: string;
  readonly whyItMatters: string;
}

export interface TipStep {
  readonly kind: 'tip';
  readonly tipId: string;
  readonly title: string;
  readonly body: string;
  readonly technique: MemoryTechnique;
}

export interface QuestionStep {
  readonly kind: 'question';
  /** Unique within the session (a missed review question can appear twice). */
  readonly key: string;
  readonly phase: QuestionPhase;
  readonly exerciseId: string;
  readonly itemIds: readonly ItemId[];
  readonly format: QuestionFormat;
  /** Shuffled options: choices, match right-hand sides, or timeline events. */
  readonly options: readonly string[];
}

export type Step = LearnStep | TipStep | QuestionStep;

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Shuffles, but never hands back the original order when another exists. */
function shuffledAway<T>(items: readonly T[], rng: Rng): T[] {
  const out = shuffled(items, rng);
  if (items.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift() as T);
  return out;
}

/**
 * Decides how to ask an exercise. New and learning items get recognition (pick an
 * option); familiar and mastered items must be typed (PRD §8: active recall over
 * recognition). Recall checks and placement questions are always typed when the
 * exercise allows it, since guessing from options proves little.
 */
export function questionFor(
  exercise: Exercise,
  phase: QuestionPhase,
  states: ReadonlyMap<ItemId, UserItemState>,
  scheduler: Scheduler,
  rng: Rng,
  key: string,
): QuestionStep {
  const base = {
    kind: 'question' as const,
    key,
    phase,
    exerciseId: exercise.id,
    itemIds: exercise.itemIds,
  };
  switch (exercise.type) {
    case 'match':
      return {
        ...base,
        format: 'match',
        options: shuffledAway(
          exercise.pairs.map((p) => p.right),
          rng,
        ),
      };
    case 'timeline_order':
      return {
        ...base,
        format: 'timeline',
        options: shuffledAway(
          exercise.events.map((e) => e.label),
          rng,
        ),
      };
    case 'higher_lower':
      return {
        ...base,
        format: 'higher_lower',
        options: [exercise.left.label, exercise.right.label],
      };
    default: {
      const first = exercise.itemIds[0];
      const state = first ? states.get(first) : undefined;
      const mastery = state ? masteryLevel(state, scheduler.config) : 'new';
      const typed =
        phase === 'recall' ||
        phase === 'placement' ||
        exerciseFormat(mastery, exercise.type) === 'production' ||
        exercise.distractors.length === 0;
      return typed
        ? { ...base, format: 'typed', options: [] }
        : {
            ...base,
            format: 'choice',
            options: shuffled([exercise.answer, ...exercise.distractors], rng),
          };
    }
  }
}

/**
 * Picks an exercise to bring an item back with: one that tests only this item if
 * possible, through the cue used least recently (PRD §8: varied cues).
 */
export function exerciseForItem(
  content: AppContent,
  itemId: ItemId,
  state: UserItemState | undefined,
  exclude: ReadonlySet<string> = new Set(),
): Exercise | undefined {
  const candidates = content.exercises
    .filter((e) => e.itemIds.includes(itemId) && !exclude.has(e.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) return undefined;
  const single = candidates.filter((e) => e.itemIds.length === 1 && supportsTypedRecall(e.type));
  const pool = single.length > 0 ? single : candidates;
  const cues = [...new Set(pool.map((e) => e.cue))];
  const cue = nextCue(cues, state?.cueHistory ?? [], { allowMediaCues: true });
  return pool.find((e) => e.cue === cue) ?? pool[0];
}

/**
 * The saved states a session may draw on for one sport: the item must still exist
 * in the content, belong to that sport, and have an exercise to ask it with. Keeps
 * sports separate (CLAUDE.md principle 6) and ignores states for items a content
 * update removed, so nothing can get stuck "due" with no way to review it.
 */
export function reviewableStates(
  content: AppContent,
  states: ReadonlyMap<ItemId, UserItemState>,
  sportId: string,
): Map<ItemId, UserItemState> {
  const askable = new Set(content.exercises.flatMap((e) => e.itemIds));
  return new Map(
    [...states].filter(([id]) => content.itemsById.get(id)?.sportId === sportId && askable.has(id)),
  );
}

export interface LessonPlanInput {
  readonly content: AppContent;
  readonly lesson: Lesson;
  readonly states: ReadonlyMap<ItemId, UserItemState>;
  readonly scheduler: Scheduler;
  readonly now: Date;
  readonly rng: Rng;
}

/**
 * A lesson, in order (PRD §7.4): callbacks to earlier material, a card for each
 * new fact, the optional memory tip, the teaching questions, then the recall check.
 */
export function planLesson(input: LessonPlanInput): Step[] {
  const { content, lesson, states, scheduler, now, rng } = input;
  const steps: Step[] = [];
  const own = new Set<string>([...lesson.exerciseIds, ...lesson.recallCheckExerciseIds]);

  const sportId = content.unitsById.get(lesson.unitId)?.sportId ?? '';
  const callbacks = pickCallbacks(scheduler, {
    lesson,
    items: content.itemsById as ReadonlyMap<ItemId, (typeof content.items)[number]>,
    states: reviewableStates(content, states, sportId),
    now,
    rng,
  });
  for (const itemId of callbacks) {
    const exercise = exerciseForItem(content, itemId, states.get(itemId), own);
    if (exercise) {
      steps.push(questionFor(exercise, 'callback', states, scheduler, rng, `callback:${itemId}`));
    }
  }

  for (const itemId of lesson.introducesItemIds) {
    const item = content.itemsById.get(itemId);
    if (item) {
      steps.push({
        kind: 'learn',
        itemId,
        label: item.label,
        statement: item.statement,
        whyItMatters: item.whyItMatters,
      });
    }
  }

  const tip = lesson.memoryTipIds[0] ? content.tipsById.get(lesson.memoryTipIds[0]) : undefined;
  if (tip) {
    steps.push({
      kind: 'tip',
      tipId: tip.id,
      title: tip.title,
      body: tip.body,
      technique: tip.technique,
    });
  }

  const ask = (ids: readonly string[], phase: QuestionPhase) => {
    for (const id of ids) {
      const exercise = content.exercisesById.get(id);
      if (exercise)
        steps.push(questionFor(exercise, phase, states, scheduler, rng, `${phase}:${id}`));
    }
  };
  ask(lesson.exerciseIds, 'learn');
  ask(lesson.recallCheckExerciseIds, 'recall');
  return steps;
}

/** One question per item due for review, each through a varied cue. */
export function planReview(
  content: AppContent,
  itemIds: readonly ItemId[],
  states: ReadonlyMap<ItemId, UserItemState>,
  scheduler: Scheduler,
  rng: Rng,
): QuestionStep[] {
  return itemIds.flatMap((itemId) => {
    const exercise = exerciseForItem(content, itemId, states.get(itemId));
    return exercise
      ? [questionFor(exercise, 'review', states, scheduler, rng, `review:${itemId}`)]
      : [];
  });
}

/**
 * In a review session a missed question comes back once at the end, after the
 * relearning step, so the session ends on a correct recall when possible.
 */
export function requeueIfMissed(steps: readonly Step[], index: number, correct: boolean): Step[] {
  const step = steps[index];
  if (correct || !step || step.kind !== 'question' || step.phase !== 'review') return [...steps];
  if (step.key.endsWith(':again')) return [...steps];
  return [...steps, { ...step, key: `${step.key}:again` }];
}
