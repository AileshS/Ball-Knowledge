import { DAY_MS } from '@ball-knowledge/retention';
import type { KeyValueStore } from '../progress/store';

/**
 * Dev-only time travel, so spacing can be tested without waiting days. The offset
 * only ever moves forward: reviews must stay in chronological order, so going back
 * in time would make saved progress unreplayable.
 */
export const CLOCK_KEY = 'bk:dev:clockOffsetDays';

export interface Clock {
  readonly offsetDays: number;
  now(): Date;
}

export function createClock(offsetDays: number, realNow: () => number = Date.now): Clock {
  return { offsetDays, now: () => new Date(realNow() + offsetDays * DAY_MS) };
}

export async function loadClockOffset(store: KeyValueStore): Promise<number> {
  const raw = await store.get(CLOCK_KEY);
  const days = raw === null ? 0 : Number(raw);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
}

/** Moves the dev clock forward and returns the new offset. */
export async function advanceClock(store: KeyValueStore, byDays: number): Promise<number> {
  if (!Number.isInteger(byDays) || byDays <= 0) throw new RangeError('Can only move forward');
  const next = (await loadClockOffset(store)) + byDays;
  await store.set(CLOCK_KEY, String(next));
  return next;
}
