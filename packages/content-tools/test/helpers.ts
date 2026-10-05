import {
  exerciseInput,
  FIXTURE_SOURCE,
  itemInput,
  lessonInput,
  memoryTipInput,
  playerInput,
  sportInput,
  unitInput,
} from '@ball-knowledge/core/testing';
import { stringify } from 'yaml';
import { checkContent, parseContentFile, type CheckOptions } from '../src/index';

export const TODAY = '2026-10-02';

/**
 * The date to check the real repository content against. Facts are dated the day
 * they're verified, so a frozen date would fail tomorrow's content; a day of margin
 * covers authors whose local date is ahead of UTC.
 */
export const CONTENT_CHECK_DATE = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const source = { ...FIXTURE_SOURCE, locator: 'Fixture page 1', quote: 'A fictional quote.' };

/**
 * A small, fully valid, fictional content set: one unit, one lesson introducing two
 * items, eight exercises (seven used), and a memory tip.
 */
export function baseContent() {
  const ex = (n: number, itemId: string) =>
    exerciseInput({ id: `fixture.ex.${n}`, itemIds: [itemId] });
  return {
    sports: [sportInput()],
    units: [unitInput()],
    entities: [
      playerInput(),
      playerInput({ id: 'fixture.era.one', kind: 'era', name: 'Fixture Era One', order: 0 }),
    ],
    items: [
      itemInput({ sources: [source] }),
      itemInput({ id: 'fixture.item.beta', label: 'Fixture Player Beta', sources: [source] }),
    ],
    exercises: [
      ex(1, 'fixture.item.alpha'),
      ex(2, 'fixture.item.beta'),
      ex(3, 'fixture.item.alpha'),
      ex(4, 'fixture.item.beta'),
      ex(5, 'fixture.item.alpha'),
      ex(6, 'fixture.item.alpha'),
      ex(7, 'fixture.item.beta'),
    ],
    lessons: [
      lessonInput({
        introducesItemIds: ['fixture.item.alpha', 'fixture.item.beta'],
        memoryTipIds: ['fixture.tip.pair'],
      }),
    ],
    tips: [
      memoryTipInput({
        id: 'fixture.tip.pair',
        itemIds: ['fixture.item.alpha', 'fixture.item.beta'],
      }),
    ],
  };
}

export type Content = ReturnType<typeof baseContent>;

/** Runs the full check on content written to YAML, as authors would write it. */
export function check(content: object, options: Partial<CheckOptions> = {}) {
  return checkContent(parseContentFile(stringify(content), 'test.yaml'), {
    mode: 'dev',
    today: TODAY,
    ...options,
  });
}

export const messages = (issues: { message: string }[]) => issues.map((i) => i.message);
