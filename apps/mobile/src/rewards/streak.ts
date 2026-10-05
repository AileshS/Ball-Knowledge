import type { ItemId, ReviewLogEntry, UserItemState } from '@ball-knowledge/core';
import { DAY_MS, type Scheduler } from '@ball-knowledge/retention';
import { foldLog, type ReplayStep } from '../sync/sync';

export type DayResult = 'kept' | 'rest' | 'missed';

export interface ReviewStreak {
  /** Days in a row (rest days don't break it) on which the due reviews got done. */
  readonly current: number;
  /** The longest streak ever. A lost streak wipes nothing (PRD §9). */
  readonly best: number;
  /** Today: already kept, or still open (an open day never breaks the streak). */
  readonly today: 'kept' | 'open';
}

export interface StreakInput {
  readonly scheduler: Scheduler;
  readonly log: readonly ReviewLogEntry[];
  readonly now: Date;
  /** Local midnight for a moment (the user's day boundary). */
  readonly startOfDay: (date: Date) => Date;
}

/**
 * The review streak rewards doing your reviews, not opening the app (PRD §9). A day
 * is:
 * - **kept** when every fact due that day was reviewed, or, if nothing was due,
 *   when you learned or reviewed anything at all;
 * - **rest** when nothing was due and you did nothing (it doesn't break the streak);
 * - **missed** when reviews were due and left undone (the streak restarts, but the
 *   best streak stays and nothing else is lost).
 * Today never counts as missed while it's still today.
 */
export function reviewStreak(input: StreakInput): ReviewStreak {
  const { scheduler, log, now, startOfDay } = input;
  const steps: ReplayStep[] = [];
  foldLog(scheduler, log, (step) => steps.push(step));
  if (steps.length === 0) return { current: 0, best: 0, today: 'open' };

  const states = new Map<ItemId, UserItemState>();
  const today = startOfDay(now).getTime();
  let day = startOfDay(steps[0]!.entry.reviewedAt).getTime();
  let i = 0;
  let current = 0;
  let best = 0;
  let todayResult: 'kept' | 'open' = 'open';

  // Advance whole local days (DST-safe: re-anchor to local midnight each step).
  const nextDay = (t: number) => startOfDay(new Date(t + DAY_MS + 2 * 60 * 60 * 1000)).getTime();

  while (day <= today) {
    const dayEnd = nextDay(day);
    const dueToday = [...states.values()]
      .filter((s) => s.phase !== 'new' && s.due.getTime() < dayEnd)
      .map((s) => s.itemId);

    let active = false;
    while (i < steps.length && steps[i]!.entry.reviewedAt.getTime() < dayEnd) {
      const { entry, after } = steps[i]!;
      states.set(entry.itemId, after);
      if (entry.reviewedAt.getTime() >= day) active = true;
      i += 1;
    }
    const cleared = dueToday.every((id) => (states.get(id)?.lastReviewedAt?.getTime() ?? 0) >= day);
    const result: DayResult =
      dueToday.length > 0 ? (cleared ? 'kept' : 'missed') : active ? 'kept' : 'rest';

    if (day === today) {
      if (result === 'kept') {
        current += 1;
        todayResult = 'kept';
      }
    } else if (result === 'kept') {
      current += 1;
    } else if (result === 'missed') {
      current = 0;
    }
    best = Math.max(best, current);
    day = dayEnd;
  }
  return { current, best, today: todayResult };
}
