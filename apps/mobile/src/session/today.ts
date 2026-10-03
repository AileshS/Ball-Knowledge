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
  /** Start of the user's local day, for the "today" counts. */
  readonly dayStart: Date;
}

export interface TodaySummary {
  /** Every fact due now, most-forgotten first. No daily cap (ADR 0006). */
  readonly reviewItemIds: readonly ItemId[];
  readonly reviewsDoneToday: number;
  /** The next open lesson on the path, if any. */
  readonly nextLesson: { readonly id: string; readonly title: string } | null;
  readonly lessonsDoneToday: number;
  /** Nothing is due right now (more lessons may still be open). */
  readonly caughtUp: boolean;
}

/**
 * What's waiting for the user in this sport: everything due now and the next
 * lesson. There is no daily goal or "done for today" stop (ADR 0006); the due
 * queue still puts the facts closest to being forgotten first.
 */
export function todaySummary(input: TodayInput): TodaySummary {
  const { content, sportId, states, completedLessons, log, scheduler, now, dayStart } = input;
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const isToday = (d: Date) => d >= dayStart && d < dayEnd;

  // Only this sport's facts that can still be asked (see reviewableStates).
  const sportStates = reviewableStates(content, states, sportId);
  const inSport = (id: string) => content.itemsById.get(id)?.sportId === sportId;

  const reviewItemIds = buildReviewQueue(scheduler, sportStates.values(), now);
  const reviewsDoneToday = new Set(
    log
      .filter((e) => e.context === 'review' && isToday(e.reviewedAt) && inSport(e.itemId))
      .map((e) => e.itemId),
  ).size;

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

  return {
    reviewItemIds,
    reviewsDoneToday,
    nextLesson,
    lessonsDoneToday,
    caughtUp: reviewItemIds.length === 0,
  };
}

/** Local midnight for a moment (the user's day boundary). */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
