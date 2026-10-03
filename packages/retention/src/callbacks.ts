import type { ItemId, KnowledgeItem, Lesson, UserItemState } from '@ball-knowledge/core';
import type { Rng } from './rng';
import { compareIds } from './compare';
import type { Scheduler } from './scheduler';

export interface CallbackRequest {
  readonly lesson: Pick<Lesson, 'introducesItemIds' | 'callbackHints' | 'callbackCount'>;
  readonly items: ReadonlyMap<ItemId, Pick<KnowledgeItem, 'id' | 'tags' | 'entityIds'>>;
  readonly states: ReadonlyMap<ItemId, UserItemState>;
  readonly now: Date;
  /** Seeded per lesson so the same lesson start always picks the same callbacks. */
  readonly rng: Rng;
  /** Defaults to the lesson's `callbackCount`. */
  readonly count?: number;
}

/** Weights for ranking callback candidates. */
const RELATED_TAG_WEIGHT = 1;
const RELATED_ENTITY_WEIGHT = 2;
const FORGETTING_WEIGHT = 2;
const JITTER = 0.05;

/**
 * Chooses previously learned items to open a lesson with (PRD §7.4, CLAUDE.md
 * principle 3: callbacks everywhere). Candidates related to the new lesson (shared
 * era, team, position or entity) rank highest, and items the user is starting to
 * forget get a boost. Never returns unlearned items or the lesson's own new items.
 */
export function pickCallbacks(scheduler: Scheduler, request: CallbackRequest): ItemId[] {
  const { lesson, items, states, now, rng } = request;
  const count = Math.max(0, request.count ?? lesson.callbackCount);
  if (count === 0) return [];

  const introduced = new Set<ItemId>(lesson.introducesItemIds);
  const lessonTags = new Set<string>(lesson.callbackHints);
  const lessonEntities = new Set<string>();
  for (const id of introduced) {
    const item = items.get(id);
    item?.tags.forEach((t) => lessonTags.add(t));
    item?.entityIds.forEach((e) => lessonEntities.add(e));
  }

  // Sorted first so the RNG is consumed in the same order however the maps were built.
  const candidates = [...states.values()]
    .filter((s) => s.phase !== 'new' && !introduced.has(s.itemId) && items.has(s.itemId))
    .sort((a, b) => compareIds(a.itemId, b.itemId));

  const scored = candidates.map((state) => {
    const item = items.get(state.itemId);
    const sharedTags = item?.tags.filter((t) => lessonTags.has(t)).length ?? 0;
    const sharedEntities = item?.entityIds.filter((e) => lessonEntities.has(e)).length ?? 0;
    const forgetting = 1 - scheduler.retrievability(state, now);
    const score =
      RELATED_TAG_WEIGHT * sharedTags +
      RELATED_ENTITY_WEIGHT * sharedEntities +
      FORGETTING_WEIGHT * forgetting +
      JITTER * rng();
    return { itemId: state.itemId, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || compareIds(a.itemId, b.itemId))
    .slice(0, count)
    .map((c) => c.itemId);
}
