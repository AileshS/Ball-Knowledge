import type { ItemId, MasteryLevel, Track, UserItemState } from '@ball-knowledge/core';
import { masteryLevel, type RetentionConfig } from '@ball-knowledge/retention';
import type { AppContent } from '../content/bundle';
import { TRACK_INFO, TRACK_ORDER } from '../model/path';

export interface MapTile {
  readonly unitId: string;
  readonly title: string;
  readonly counts: Readonly<Record<MasteryLevel, number>>;
  readonly total: number;
  /** Share of the unit's facts that are Mastered, 0–1. */
  readonly mastered: number;
}

export interface MapSection {
  readonly track: Track;
  readonly title: string;
  readonly tiles: readonly MapTile[];
}

/**
 * The mastery map (PRD §9): one tile per unit, filling in as its facts reach
 * Mastered. Units with no lessons yet are left off.
 */
export function masteryMap(
  content: AppContent,
  sportId: string,
  states: ReadonlyMap<ItemId, UserItemState>,
  config: RetentionConfig,
): MapSection[] {
  return TRACK_ORDER.map((track) => {
    const tiles = content.units
      .filter((u) => u.sportId === sportId && u.track === track)
      .sort((a, b) => a.order - b.order)
      .flatMap((unit): MapTile[] => {
        const itemIds = content.lessons
          .filter((l) => l.unitId === unit.id)
          .flatMap((l) => l.introducesItemIds);
        if (itemIds.length === 0) return [];
        const counts: Record<MasteryLevel, number> = {
          new: 0,
          learning: 0,
          familiar: 0,
          mastered: 0,
        };
        for (const id of itemIds) {
          const state = states.get(id);
          counts[state ? masteryLevel(state, config) : 'new'] += 1;
        }
        return [
          {
            unitId: unit.id,
            title: unit.title,
            counts,
            total: itemIds.length,
            mastered: counts.mastered / itemIds.length,
          },
        ];
      });
    return { track, title: TRACK_INFO[track].title, tiles };
  }).filter((section) => section.tiles.length > 0);
}

/** Mastered facts in a sport (what ranks are gated on). */
export function masteredCount(
  content: AppContent,
  sportId: string,
  states: ReadonlyMap<ItemId, UserItemState>,
  config: RetentionConfig,
): number {
  let count = 0;
  for (const state of states.values()) {
    if (content.itemsById.get(state.itemId)?.sportId !== sportId) continue;
    if (masteryLevel(state, config) === 'mastered') count += 1;
  }
  return count;
}
