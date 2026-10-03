/**
 * Drives the retention engine through a year of simulated daily use: each day the
 * learner finishes the daily plan (reviews, re-asking misses within the session) and
 * then takes one new lesson that opens with callbacks and closes with a recall check.
 */
import type {
  EntityId,
  Grade,
  ItemId,
  KnowledgeItem,
  Lesson,
  ReviewContext,
  UserItemState,
} from '@ball-knowledge/core';
import {
  buildReviewQueue,
  createScheduler,
  createSeededRng,
  dailyPlan,
  DAY_MS,
  DEFAULT_RETENTION_CONFIG,
  isDoneForToday,
  masteryLevel,
  pickCallbacks,
  type RetentionConfig,
} from '../../src/index';
import { addMinutes, itemId, makeItem, T0 } from '../helpers';
import { SimulatedLearner, type LearnerProfile } from './learner';

export interface SimulationOptions {
  readonly profile: LearnerProfile;
  readonly seed: number;
  readonly days: number;
  readonly itemsPerLesson: number;
  readonly config?: RetentionConfig;
  /** Days the learner does not open the app at all (e.g. a vacation). */
  readonly skipDays?: ReadonlySet<number>;
}

export interface DayStats {
  readonly day: number;
  /** False on days the learner skipped. */
  readonly active: boolean;
  /** Planned reviews plus in-session re-asks of misses. */
  readonly reviewAnswers: number;
  readonly planned: number;
  readonly deferred: number;
  readonly lessons: number;
  readonly callbacks: number;
  readonly done: boolean;
}

export interface SimulationResult {
  readonly profile: string;
  readonly days: readonly DayStats[];
  readonly itemsLearned: number;
  readonly masteryCounts: Readonly<Record<string, number>>;
  /** PRD §12 north star: recall on reviews of Mastered items 30+ days after first learning. */
  readonly northStar: { readonly reviews: number; readonly accuracy: number };
  /** True recall 30 days after an item first reached Mastered, with no review in between. */
  readonly masteredRecallAt30Days: { readonly items: number; readonly mean: number };
  /** Accuracy across all review-session answers. */
  readonly reviewAccuracy: number;
  /** Longest wait past an item's due time before it was reviewed. */
  readonly maxOverdueDays: number;
}

/** Fictional catalog: each lesson's items share an era and team tag, so callbacks have relatives. */
function buildCatalog(lessons: number, perLesson: number): Map<ItemId, KnowledgeItem> {
  const items = new Map<ItemId, KnowledgeItem>();
  for (let lesson = 0; lesson < lessons; lesson++) {
    for (let k = 0; k < perLesson; k++) {
      const n = lesson * perLesson + k + 1;
      items.set(
        itemId(n),
        makeItem(n, {
          tags: [`era:fixture-era-${lesson % 12}`, `team:fixture-team-${lesson % 16}`],
          entityIds: [`fixture.player.p${n % 500}`],
        }),
      );
    }
  }
  return items;
}

export function simulate(options: SimulationOptions): SimulationResult {
  const config = options.config ?? DEFAULT_RETENTION_CONFIG;
  const scheduler = createScheduler(config);
  const rng = createSeededRng(options.seed);
  const learner = new SimulatedLearner(options.profile, rng);
  const items = buildCatalog(options.days, options.itemsPerLesson);
  const entityIdsByItem = new Map<ItemId, readonly EntityId[]>(
    [...items].map(([id, item]) => [id, item.entityIds]),
  );
  const states = new Map<ItemId, UserItemState>();
  const reachedMastered = new Set<ItemId>();

  const days: DayStats[] = [];
  let northStarReviews = 0;
  let northStarCorrect = 0;
  let masteredRecallSum = 0;
  let reviewAnswers = 0;
  let reviewCorrect = 0;
  let maxOverdueDays = 0;
  let nextLesson = 0;

  const answer = (id: ItemId, now: Date, context: ReviewContext): Grade => {
    const before = states.get(id) ?? scheduler.newItemState(id, now);
    const grade = learner.answer(id, now);
    const { state, logEntry } = scheduler.applyReview(before, {
      grade,
      now,
      cue: 'name',
      exerciseType: 'multiple_choice',
      context,
    });
    states.set(id, state);
    if (masteryLevel(before, config) === 'mastered' && logEntry.daysSinceFirstLearned >= 30) {
      northStarReviews += 1;
      if (logEntry.correct) northStarCorrect += 1;
    }
    if (!reachedMastered.has(id) && masteryLevel(state, config) === 'mastered') {
      reachedMastered.add(id);
      masteredRecallSum += learner.recallProbability(id, now, 30);
    }
    return grade;
  };

  for (let day = 0; day < options.days; day++) {
    if (options.skipDays?.has(day)) {
      days.push({
        day,
        active: false,
        reviewAnswers: 0,
        planned: 0,
        deferred: 0,
        lessons: 0,
        callbacks: 0,
        done: false,
      });
      continue;
    }
    const dayStart = new Date(T0.getTime() + day * DAY_MS); // 09:00
    const dueBy = new Date(dayStart.getTime() + 15 * 60 * 60 * 1000); // midnight
    let now = dayStart;

    const plan = dailyPlan(scheduler, states.values(), now, {
      dueBy,
      newLessonAvailable: nextLesson < options.days,
      entityIdsByItem,
    });

    // Review session; misses come back after the relearning step, up to 3 passes.
    const reviewed = new Set<ItemId>();
    let answersToday = 0;
    let queue: readonly ItemId[] = plan.reviewItemIds;
    for (let pass = 0; pass < 4 && queue.length > 0; pass++) {
      for (const id of queue) {
        const before = states.get(id)!;
        if (pass === 0) {
          maxOverdueDays = Math.max(
            maxOverdueDays,
            (now.getTime() - before.due.getTime()) / DAY_MS,
          );
        }
        const grade = answer(id, now, 'review');
        reviewed.add(id);
        answersToday += 1;
        reviewAnswers += 1;
        if (grade !== 'again') reviewCorrect += 1;
        now = new Date(now.getTime() + 15_000);
      }
      now = addMinutes(now, 10);
      const inSession = [...reviewed].map((id) => states.get(id)!);
      queue = buildReviewQueue(scheduler, inSession, now).filter(
        (id) => states.get(id)!.phase === 'relearning',
      );
    }

    // One new lesson: callbacks, new items, then a recall check 5 minutes later.
    let lessons = 0;
    let callbacks = 0;
    if (plan.newLessons === 1) {
      const lessonStart = new Date(dayStart.getTime() + 10 * 60 * 60 * 1000); // 19:00
      const introduced = Array.from({ length: options.itemsPerLesson }, (_, k) =>
        itemId(nextLesson * options.itemsPerLesson + k + 1),
      );
      const lesson: Pick<Lesson, 'introducesItemIds' | 'callbackHints' | 'callbackCount'> = {
        introducesItemIds: introduced,
        callbackHints: [],
        callbackCount: 2,
      };
      const picked = pickCallbacks(scheduler, {
        lesson,
        items,
        states,
        now: lessonStart,
        rng: createSeededRng(options.seed * 1_000 + day),
      });
      let t = lessonStart;
      for (const id of picked) {
        answer(id, t, 'callback');
        t = new Date(t.getTime() + 20_000);
      }
      for (const id of introduced) {
        answer(id, t, 'lesson');
        t = new Date(t.getTime() + 20_000);
      }
      const recallAt = addMinutes(t, 5);
      introduced.forEach((id, k) =>
        answer(id, new Date(recallAt.getTime() + k * 20_000), 'recall_check'),
      );
      callbacks = picked.length;
      lessons = 1;
      nextLesson += 1;
    }

    days.push({
      day,
      active: true,
      reviewAnswers: answersToday,
      planned: plan.reviewItemIds.length,
      deferred: plan.deferredCount,
      lessons,
      callbacks,
      done: isDoneForToday(plan, { reviewedItemIds: reviewed, lessonsCompleted: lessons }),
    });
  }

  const masteryCounts: Record<string, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const state of states.values()) masteryCounts[masteryLevel(state, config)]! += 1;

  return {
    profile: options.profile.name,
    days,
    itemsLearned: states.size,
    masteryCounts,
    northStar: {
      reviews: northStarReviews,
      accuracy: northStarReviews === 0 ? 0 : northStarCorrect / northStarReviews,
    },
    masteredRecallAt30Days: {
      items: reachedMastered.size,
      mean: reachedMastered.size === 0 ? 0 : masteredRecallSum / reachedMastered.size,
    },
    reviewAccuracy: reviewAnswers === 0 ? 0 : reviewCorrect / reviewAnswers,
    maxOverdueDays,
  };
}

/** Mean of `reviewAnswers` over a range of days. */
export function meanDailyReviews(result: SimulationResult, fromDay: number, toDay: number): number {
  const slice = result.days.slice(fromDay, toDay);
  return slice.reduce((sum, d) => sum + d.reviewAnswers, 0) / Math.max(1, slice.length);
}
