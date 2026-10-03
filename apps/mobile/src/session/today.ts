import type { ItemId, ReviewLogEntry, UserItemState } from '@ball-knowledge/core';
import { buildReviewQueue, DAY_MS, type Scheduler } from '@ball-knowledge/retention';
import type { AppContent } from '../content/bundle';
import { learningPath, TRACK_ORDER } from '../model/path';
import { reviewableStates } from './plan';

export interface TodayInput {
  readonly content: AppContent;
  readonly sportId: string;
  readonly states: ReadonlyMap<ItemId, UserItemState>;
  readonly completedLessons: ReadonlyMap<string, string>;
  readonly log: readonly ReviewLogEntry[];
  readonly scheduler: Scheduler;
  readonly now: Date;
  /** Start of the user's local day; the day runs for 24 hours from here. */
  readonly dayStart: Date;
}

export interface TodaySummary {
  /** Reviews left for today, most-forgotten first. */
  readonly reviewItemIds: readonly ItemId[];
  readonly reviewsDoneToday: number;
  /** Due items pushed to tomorrow by the daily cap. */
  readonly deferred: number;
  readonly nextLesson: { readonly id: string; readonly title: string } | null;
  readonly lessonsDoneToday: number;
  /** New lessons in today's goal: 1, or 0 while a review backlog is over the cap. */
  readonly lessonGoal: 0 | 1;
  /** Today's goal is met: "you're done for today" (PRD §9). */
  readonly done: boolean;
}

/**
 * Today's small, finishable goal: due reviews (capped per day, counting reviews
 * already done today) plus one new lesson. Once met, the app says so instead of
 * offering more (PRD §9, CLAUDE.md principle 1).
 */
export function todaySummary(input: TodayInput): TodaySummary {
  const { content, sportId, states, completedLessons, log, scheduler, now, dayStart } = input;
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const isToday = (d: Date) => d >= dayStart && d < dayEnd;

  // Only this sport's facts that can still be asked (see reviewableStates).
  const sportStates = reviewableStates(content, states, sportId);
  const inSport = (id: string) => content.itemsById.get(id)?.sportId === sportId;

  const reviewedToday = new Set(
    log
      .filter((e) => e.context === 'review' && isToday(e.reviewedAt) && inSport(e.itemId))
      .map((e) => e.itemId),
  );
  const due = buildReviewQueue(scheduler, sportStates.values(), now, { dueBy: dayEnd }).filter(
    (id) => !reviewedToday.has(id),
  );
  const cap = Math.max(0, scheduler.config.maxDailyReviews - reviewedToday.size);
  const reviewItemIds = due.slice(0, cap);
  const deferred = due.length - reviewItemIds.length;

  const lessonsDoneToday = [...completedLessons].filter(([lessonId, iso]) => {
    const lesson = content.lessonsById.get(lessonId);
    const unit = lesson ? content.unitsById.get(lesson.unitId) : undefined;
    return unit?.sportId === sportId && isToday(new Date(iso));
  }).length;

  const completedIds = new Set(completedLessons.keys());
  let nextLesson: TodaySummary['nextLesson'] = null;
  for (const track of TRACK_ORDER) {
    const units = learningPath({
      content,
      sportId,
      track,
      completedLessonIds: completedIds,
      states,
      scheduler,
      now,
    });
    const lesson = units.flatMap((u) => u.lessons).find((l) => l.status === 'available');
    if (lesson) {
      nextLesson = { id: lesson.id, title: lesson.title };
      break;
    }
  }

  const overCap = reviewedToday.size + due.length > scheduler.config.maxDailyReviews;
  const lessonGoal: 0 | 1 = lessonsDoneToday > 0 || (nextLesson !== null && !overCap) ? 1 : 0;

  return {
    reviewItemIds,
    reviewsDoneToday: reviewedToday.size,
    deferred,
    nextLesson,
    lessonsDoneToday,
    lessonGoal,
    done: reviewItemIds.length === 0 && lessonsDoneToday >= lessonGoal,
  };
}

/** Local midnight for a moment (the user's day boundary). */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
