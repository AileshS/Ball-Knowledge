import type { ItemId, MemoryTip } from '@ball-knowledge/core';

/**
 * Memory tips to show before the next attempt (PRD §8): when the user misses an
 * item that belongs to a tip's set, the tip comes back. Correct answers show nothing,
 * since tips are seasoning, not the meal.
 */
export function tipsForRetry(
  itemId: ItemId,
  correct: boolean,
  tips: readonly MemoryTip[],
): MemoryTip[] {
  if (correct) return [];
  return tips.filter((tip) => tip.itemIds.includes(itemId));
}
