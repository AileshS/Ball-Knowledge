import type { ReviewLogEntry, UserItemState } from '@ball-knowledge/core';
import type { Scheduler } from '@ball-knowledge/retention';
import { foldLog } from '../sync/sync';

/**
 * XP rewards correct recall only (PRD §9, CLAUDE.md principle 2): nothing for
 * opening a lesson or for a wrong answer, and more for facts that are harder or
 * were learned longer ago, because remembering those is the real win.
 */
export const XP_RULES = {
  /** XP for a correct answer on a fresh, average fact. */
  base: 10,
  /** Days after first learning at which the age bonus is full (double XP). */
  fullAgeDays: 60,
  /** Extra share for the hardest facts (FSRS difficulty 10 → +50%). */
  maxDifficultyBonus: 0.5,
  /** A correct placement answer shows prior knowledge, but there's no recall effort to reward. */
  placement: 5,
} as const;

/** XP for one answer, given the item's memory state just before it. */
export function xpForAnswer(before: UserItemState | undefined, entry: ReviewLogEntry): number {
  if (!entry.correct) return 0;
  if (entry.context === 'placement') return XP_RULES.placement;
  const age = Math.min(1, Math.max(0, entry.daysSinceFirstLearned) / XP_RULES.fullAgeDays);
  const difficulty =
    before && before.difficulty > 0
      ? Math.min(XP_RULES.maxDifficultyBonus, Math.max(0, (before.difficulty - 5) / 10))
      : 0;
  return Math.round(XP_RULES.base * (1 + age) * (1 + difficulty));
}

export interface XpTotals {
  readonly total: number;
  readonly today: number;
}

/** Total XP and today's XP, replayed from the review log. */
export function xpTotals(
  scheduler: Scheduler,
  log: readonly ReviewLogEntry[],
  dayStart: Date,
): XpTotals {
  let total = 0;
  let today = 0;
  foldLog(scheduler, log, ({ entry, before }) => {
    const xp = xpForAnswer(before, entry);
    total += xp;
    if (entry.reviewedAt >= dayStart) today += xp;
  });
  return { total, today };
}
