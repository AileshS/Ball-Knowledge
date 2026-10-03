import type { EntityId, ItemId, UserItemState } from '@ball-knowledge/core';
import { compareIds } from './compare';
import type { Scheduler } from './scheduler';

export interface QueueOptions {
  /** Include items due up to this moment (e.g. the end of the user's day). Defaults to `now`. */
  readonly dueBy?: Date;
  /** Maximum number of items to return. */
  readonly limit?: number;
  /** Entities each item is about, used to avoid asking about the same one back-to-back. */
  readonly entityIdsByItem?: ReadonlyMap<ItemId, readonly EntityId[]>;
}

/**
 * Today's review queue: learned items that are due, most-forgotten first, with
 * items about the same entity spread apart (interleaving, PRD §8).
 */
export function buildReviewQueue(
  scheduler: Scheduler,
  states: Iterable<UserItemState>,
  now: Date,
  options: QueueOptions = {},
): ItemId[] {
  const dueBy = (options.dueBy ?? now).getTime();
  const due = [...states]
    .filter((s) => s.phase !== 'new' && s.due.getTime() <= dueBy)
    .map((s) => ({ state: s, recall: scheduler.retrievability(s, now) }))
    .sort(
      (a, b) =>
        a.recall - b.recall ||
        a.state.due.getTime() - b.state.due.getTime() ||
        compareIds(a.state.itemId, b.state.itemId),
    )
    .map((x) => x.state.itemId);

  const ordered = interleaveByEntity(due, options.entityIdsByItem);
  return options.limit === undefined ? ordered : ordered.slice(0, Math.max(0, options.limit));
}

/**
 * Keeps the given priority order, except that an item sharing an entity with the
 * previous one is deferred when a non-conflicting item is available.
 */
function interleaveByEntity(
  ids: readonly ItemId[],
  entityIdsByItem: ReadonlyMap<ItemId, readonly EntityId[]> | undefined,
): ItemId[] {
  if (!entityIdsByItem) return [...ids];
  const remaining = [...ids];
  const result: ItemId[] = [];
  let previous: ReadonlySet<EntityId> = new Set();
  while (remaining.length > 0) {
    let index = remaining.findIndex(
      (id) => !(entityIdsByItem.get(id) ?? []).some((e) => previous.has(e)),
    );
    if (index === -1) index = 0;
    const [next] = remaining.splice(index, 1) as [ItemId];
    result.push(next);
    previous = new Set(entityIdsByItem.get(next) ?? []);
  }
  return result;
}

export interface DailyPlanOptions extends Pick<QueueOptions, 'dueBy' | 'entityIdsByItem'> {
  /** Whether there is a next lesson on the user's path. */
  readonly newLessonAvailable: boolean;
}

export interface DailyPlan {
  /** Reviews for today, capped so the goal is finishable. */
  readonly reviewItemIds: readonly ItemId[];
  /** Due items left for tomorrow because of the cap. */
  readonly deferredCount: number;
  /** New lessons in today's goal: 1, or 0 when catching up on a review backlog. */
  readonly newLessons: 0 | 1;
}

/**
 * A small, finishable daily goal (PRD §9): today's due reviews plus one new lesson.
 * When the backlog exceeds the daily cap, the plan skips the new lesson so the user
 * catches up on what they already learned first (retention beats engagement).
 */
export function dailyPlan(
  scheduler: Scheduler,
  states: Iterable<UserItemState>,
  now: Date,
  options: DailyPlanOptions,
): DailyPlan {
  const queue = buildReviewQueue(scheduler, states, now, options);
  const reviewItemIds = queue.slice(0, scheduler.config.maxDailyReviews);
  const deferredCount = queue.length - reviewItemIds.length;
  return {
    reviewItemIds,
    deferredCount,
    newLessons: options.newLessonAvailable && deferredCount === 0 ? 1 : 0,
  };
}

export interface DayProgress {
  readonly reviewedItemIds: Iterable<ItemId>;
  readonly lessonsCompleted: number;
}

/** True once the day's goal is met, so the app can say "you're done for today." */
export function isDoneForToday(plan: DailyPlan, progress: DayProgress): boolean {
  const reviewed = new Set(progress.reviewedItemIds);
  return (
    plan.reviewItemIds.every((id) => reviewed.has(id)) &&
    progress.lessonsCompleted >= plan.newLessons
  );
}
