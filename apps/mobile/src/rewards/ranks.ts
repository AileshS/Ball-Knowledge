export interface Rank {
  readonly level: number;
  readonly title: string;
  /** Mastered facts needed in this sport. */
  readonly minMastered: number;
}

/**
 * Knowledge ranks (PRD §9), gated only on mastered facts, so they can't be ground
 * out by time spent. Titles are the PRD's; thresholds are tunable as content grows.
 */
export const RANKS: readonly Rank[] = [
  { level: 1, title: 'Rookie', minMastered: 0 },
  { level: 2, title: 'Starter', minMastered: 5 },
  { level: 3, title: 'Pro Bowl', minMastered: 25 },
  { level: 4, title: 'All-Pro', minMastered: 100 },
  { level: 5, title: 'Hall of Fame', minMastered: 250 },
];

export interface RankStatus {
  readonly rank: Rank;
  readonly next: Rank | null;
  /** Mastered facts still needed for the next rank (0 at the top). */
  readonly toNext: number;
  /** Progress from this rank to the next, 0–1 (1 at the top). */
  readonly progress: number;
}

export function rankFor(mastered: number, ranks: readonly Rank[] = RANKS): RankStatus {
  const count = Math.max(0, Math.floor(mastered));
  const index = ranks.reduce((best, r, i) => (count >= r.minMastered ? i : best), 0);
  const rank = ranks[index]!;
  const next = ranks[index + 1] ?? null;
  if (!next) return { rank, next: null, toNext: 0, progress: 1 };
  const span = next.minMastered - rank.minMastered;
  return {
    rank,
    next,
    toNext: next.minMastered - count,
    progress: (count - rank.minMastered) / span,
  };
}
