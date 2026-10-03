import type { ItemId, KnowledgeItem, UserItemState } from '@ball-knowledge/core';
import { fixtureLesson, fixtureMemoryTip } from '@ball-knowledge/core/testing';
import { describe, expect, it } from 'vitest';
import {
  createScheduler,
  createSeededRng,
  exerciseFormat,
  nextCue,
  pickCallbacks,
  tipsForRetry,
} from '../src/index';
import { addDays, itemId, learnInLesson, makeItem, T0 } from './helpers';

const scheduler = createScheduler();

/**
 * A small fictional catalog:
 * - n1, n2: learned, same era as the new lesson (n2 also shares an entity)
 * - n3, n4: learned, unrelated (n4 learned much earlier, so more forgotten)
 * - n5: never learned
 * - n6: introduced by the lesson itself
 */
function catalog() {
  const items = new Map<ItemId, KnowledgeItem>(
    [
      makeItem(1, { tags: ['era:fixture-era-one'] }),
      makeItem(2, { tags: ['era:fixture-era-one'], entityIds: ['fixture.player.alpha'] }),
      makeItem(3, { tags: ['era:fixture-era-two'] }),
      makeItem(4, { tags: ['era:fixture-era-two'] }),
      makeItem(5, { tags: ['era:fixture-era-one'] }),
      makeItem(6, { tags: ['era:fixture-era-one'], entityIds: ['fixture.player.alpha'] }),
    ].map((item) => [item.id, item]),
  );
  const states = new Map<ItemId, UserItemState>([
    [itemId(1), learnInLesson(scheduler, itemId(1), addDays(T0, 20))],
    [itemId(2), learnInLesson(scheduler, itemId(2), addDays(T0, 20))],
    [itemId(3), learnInLesson(scheduler, itemId(3), addDays(T0, 20))],
    [itemId(4), learnInLesson(scheduler, itemId(4), T0)],
    [itemId(5), scheduler.newItemState(itemId(5), T0)],
    [itemId(6), learnInLesson(scheduler, itemId(6), addDays(T0, 20))],
  ]);
  const lesson = fixtureLesson({
    introducesItemIds: [itemId(6)],
    callbackHints: [],
    callbackCount: 2,
  });
  return { items, states, lesson, now: addDays(T0, 25) };
}

describe('pickCallbacks', () => {
  it('prefers learned items related to the new lesson', () => {
    const { items, states, lesson, now } = catalog();
    const picked = pickCallbacks(scheduler, {
      lesson,
      items,
      states,
      now,
      rng: createSeededRng(1),
    });
    expect(picked).toEqual([itemId(2), itemId(1)]);
  });

  it('never returns unlearned items or the lesson’s own new items', () => {
    const { items, states, lesson, now } = catalog();
    const picked = pickCallbacks(scheduler, {
      lesson,
      items,
      states,
      now,
      rng: createSeededRng(1),
      count: 10,
    });
    expect(picked).toHaveLength(4);
    expect(picked).not.toContain(itemId(5));
    expect(picked).not.toContain(itemId(6));
  });

  it('falls back to the most-forgotten items when nothing is related', () => {
    const { items, states, now } = catalog();
    const lesson = fixtureLesson({ introducesItemIds: [itemId(99)], callbackHints: [] });
    const picked = pickCallbacks(scheduler, {
      lesson,
      items,
      states,
      now,
      rng: createSeededRng(1),
      count: 1,
    });
    expect(picked).toEqual([itemId(4)]);
  });

  it('uses callback hints from the lesson', () => {
    const { items, states, now } = catalog();
    const lesson = fixtureLesson({
      introducesItemIds: [itemId(99)],
      callbackHints: ['era:fixture-era-two'],
    });
    const picked = pickCallbacks(scheduler, {
      lesson,
      items,
      states,
      now,
      rng: createSeededRng(1),
    });
    expect(new Set(picked)).toEqual(new Set([itemId(3), itemId(4)]));
  });

  it('is deterministic for a seed, whatever order the maps were built in', () => {
    const { items, states, lesson, now } = catalog();
    const reversed = new Map([...states].reverse());
    const a = pickCallbacks(scheduler, { lesson, items, states, now, rng: createSeededRng(42) });
    const b = pickCallbacks(scheduler, {
      lesson,
      items,
      states: reversed,
      now,
      rng: createSeededRng(42),
    });
    expect(a).toEqual(b);
  });

  it('returns nothing when no callbacks are wanted', () => {
    const { items, states, lesson, now } = catalog();
    expect(
      pickCallbacks(scheduler, { lesson, items, states, now, rng: createSeededRng(1), count: 0 }),
    ).toEqual([]);
  });
});

describe('nextCue', () => {
  it('rotates to the cue used least recently', () => {
    expect(nextCue(['name', 'jersey', 'stat'], ['name', 'jersey'])).toBe('stat');
    expect(nextCue(['name', 'jersey', 'stat'], ['stat', 'name', 'jersey'])).toBe('jersey');
    expect(nextCue(['name', 'jersey'], [])).toBe('name');
  });

  it('skips media cues until licensed, unless they are all an item has', () => {
    expect(nextCue(['photo', 'name'], ['name'])).toBe('name');
    expect(nextCue(['photo', 'name'], ['name'], { allowMediaCues: true })).toBe('photo');
    expect(nextCue(['clip'], [])).toBe('clip');
  });

  it('rejects items with no cues', () => {
    expect(() => nextCue([], [])).toThrow(RangeError);
  });
});

describe('exerciseFormat', () => {
  it('moves from recognition to production as mastery grows', () => {
    expect(exerciseFormat('new', 'identify')).toBe('recognition');
    expect(exerciseFormat('learning', 'fill_blank')).toBe('recognition');
    expect(exerciseFormat('familiar', 'identify')).toBe('production');
    expect(exerciseFormat('mastered', 'who_did_it')).toBe('production');
  });

  it('keeps structured exercises structured', () => {
    expect(exerciseFormat('mastered', 'timeline_order')).toBe('structured');
    expect(exerciseFormat('new', 'match')).toBe('structured');
  });
});

describe('tipsForRetry', () => {
  const tip = fixtureMemoryTip();
  const [inTip] = tip.itemIds;

  it('brings a tip back after a miss on one of its items', () => {
    expect(tipsForRetry(inTip!, false, [tip])).toEqual([tip]);
  });

  it('shows nothing after a correct answer or for items without a tip', () => {
    expect(tipsForRetry(inTip!, true, [tip])).toEqual([]);
    expect(tipsForRetry(itemId(1), false, [tip])).toEqual([]);
  });
});

describe('createSeededRng', () => {
  it('is reproducible and stays in [0, 1)', () => {
    const a = createSeededRng(7);
    const b = createSeededRng(7);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createSeededRng(8)()).not.toBe(createSeededRng(7)());
  });
});
