import {
  exerciseInput,
  itemInput,
  lessonInput,
  sportInput,
  unitInput,
} from '@ball-knowledge/core/testing';
import { buildBundle, checkContent, loadContentDir } from '@ball-knowledge/content-tools';
import { join } from 'node:path';
import { loadBundle, type AppContent } from '../src/content/bundle';

/** The real repository content, built exactly as `npm run content` does. */
export function repoContent(): AppContent {
  const dir = join(import.meta.dirname, '..', '..', '..', 'content');
  const result = checkContent(loadContentDir(dir), { mode: 'dev', today: '2026-10-03' });
  return loadBundle(JSON.parse(JSON.stringify(buildBundle(result, 'dev', '2026-10-03'))));
}

const lesson = (id: string, unitId: string, order: number, items: string[]) =>
  lessonInput({ id, unitId, order, introducesItemIds: items });

/**
 * A fictional bundle shaped to exercise the path rules:
 * - unit one (order 0): lessons one.a, one.b
 * - unit two (order 1): requires unit one; lesson two.a
 * - unit three (order 2): no lessons yet
 * plus a live and a coming-soon sport.
 */
export function fixtureBundleJson() {
  return {
    formatVersion: 1,
    mode: 'dev',
    builtOn: '2026-10-03',
    sports: [
      sportInput({ id: 'zz-later', name: 'Zed League', status: 'coming_soon' }),
      sportInput(),
      sportInput({ id: 'aa-later', name: 'Alpha League', status: 'coming_soon' }),
    ],
    units: [
      unitInput({ id: 'fixture.unit.two', order: 1, prerequisites: ['fixture.unit.one'] }),
      unitInput({ id: 'fixture.unit.one', order: 0 }),
      unitInput({ id: 'fixture.unit.three', order: 2 }),
      unitInput({ id: 'fixture.unit.f', track: 'foundations', kind: 'topic', order: 0 }),
    ],
    entities: [],
    items: ['a1', 'a2', 'b1', 'c1'].map((n) =>
      itemInput({ id: `fixture.item.${n}`, label: `Fixture fact ${n}` }),
    ),
    exercises: [exerciseInput()],
    lessons: [
      lesson('fixture.lesson.one.b', 'fixture.unit.one', 1, ['fixture.item.b1']),
      lesson('fixture.lesson.one.a', 'fixture.unit.one', 0, ['fixture.item.a1', 'fixture.item.a2']),
      lesson('fixture.lesson.two.a', 'fixture.unit.two', 0, ['fixture.item.c1']),
    ],
    tips: [],
  };
}

export const fixtureContent = (): AppContent => loadBundle(fixtureBundleJson());
