import type { ItemId } from '@ball-knowledge/core';
import { createScheduler } from '@ball-knowledge/retention';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/content/bundle';
import {
  awaitingReview,
  learningPath,
  lessonPreview,
  lessonStatus,
  sportCards,
  trackCards,
  type PathInput,
} from '../src/model/path';
import { fixtureBundleJson, fixtureContent, repoContent } from './helpers';

const scheduler = createScheduler();
const now = new Date('2026-10-03T12:00:00Z');

const path = (overrides: Partial<PathInput> = {}) =>
  learningPath({
    content: fixtureContent(),
    sportId: 'fixture-sport',
    track: 'past',
    completedLessonIds: new Set(),
    states: new Map(),
    scheduler,
    now,
    ...overrides,
  });

describe('loadBundle', () => {
  it('indexes a valid bundle', () => {
    const content = fixtureContent();
    expect(content.lessonsById.get('fixture.lesson.one.a')?.order).toBe(0);
    expect(content.itemsById.size).toBe(4);
  });

  it('fails loudly on a malformed bundle', () => {
    expect(() => loadBundle({ ...fixtureBundleJson(), formatVersion: 2 })).toThrow(
      /Content bundle is invalid \(run npm run content:build\): formatVersion/,
    );
  });

  it('loads the real repository content', () => {
    const content = repoContent();
    expect(content.sports.map((s) => s.id).sort()).toEqual(['nba', 'nfl']);
    expect(content.lessons.length).toBeGreaterThan(0);
  });
});

describe('sportCards', () => {
  it('lists live sports first, then coming soon, each by name', () => {
    expect(sportCards(fixtureContent())).toEqual([
      { id: 'fixture-sport', name: 'Fixture Sport', live: true },
      { id: 'aa-later', name: 'Alpha League', live: false },
      { id: 'zz-later', name: 'Zed League', live: false },
    ]);
  });
});

describe('trackCards', () => {
  it('counts units, lessons, and progress per track, in path order', () => {
    const cards = trackCards(fixtureContent(), 'fixture-sport', new Set(['fixture.lesson.one.a']));
    expect(cards.map((c) => [c.track, c.unitCount, c.lessonCount, c.completedLessons])).toEqual([
      ['foundations', 1, 0, 0],
      ['past', 3, 3, 1],
      ['present', 0, 0, 0],
    ]);
    expect(cards[0]?.title).toBe('Foundations');
  });
});

describe('learningPath', () => {
  it('orders units and lessons, opening only the first lesson at the start', () => {
    const units = path();
    expect(units.map((u) => [u.id, u.status])).toEqual([
      ['fixture.unit.one', 'available'],
      ['fixture.unit.two', 'locked'],
      ['fixture.unit.three', 'coming_soon'],
    ]);
    expect(units[0]?.lessons.map((l) => [l.id, l.status])).toEqual([
      ['fixture.lesson.one.a', 'available'],
      ['fixture.lesson.one.b', 'locked'],
    ]);
    expect(units[1]?.lessons[0]?.status).toBe('locked');
  });

  it('opens lessons one after another, and the next unit once its prerequisite is done', () => {
    const halfway = path({ completedLessonIds: new Set(['fixture.lesson.one.a']) });
    expect(halfway[0]?.lessons.map((l) => l.status)).toEqual(['completed', 'available']);
    expect(halfway[1]?.status).toBe('locked');

    const done = path({
      completedLessonIds: new Set(['fixture.lesson.one.a', 'fixture.lesson.one.b']),
    });
    expect(done[0]?.status).toBe('completed');
    expect(done[1]?.status).toBe('available');
    expect(done[1]?.lessons[0]?.status).toBe('available');
  });

  it('summarizes each unit’s memory health from the user’s item states', () => {
    let learned = scheduler.newItemState('fixture.item.a1' as ItemId, now);
    for (const at of ['2026-08-01', '2026-08-02', '2026-08-06', '2026-08-20']) {
      learned = scheduler.applyReview(learned, {
        grade: 'good',
        now: new Date(`${at}T09:00:00Z`),
        cue: 'name',
        exerciseType: 'multiple_choice',
        context: 'review',
      }).state;
    }
    const [unit] = path({ states: new Map([[learned.itemId, learned]]) });
    expect(unit?.health.total).toBe(3);
    expect(unit?.health.learned).toBe(1);
    expect(unit?.lessons[0]?.newItems).toBe(2);
  });

  it('does not let a coming-soon prerequisite lock a unit forever', () => {
    const json = fixtureBundleJson();
    json.units.find((u) => u.id === 'fixture.unit.two')!.prerequisites = ['fixture.unit.three'];
    const units = path({ content: loadBundle(json) });
    expect(units.find((u) => u.id === 'fixture.unit.two')?.status).toBe('available');
    expect(units.find((u) => u.id === 'fixture.unit.three')?.status).toBe('coming_soon');
  });

  it('is empty for a track with no units', () => {
    expect(path({ track: 'present' })).toEqual([]);
  });
});

describe('lessonPreview', () => {
  it('describes what a lesson teaches and how it runs', () => {
    expect(lessonPreview(fixtureContent(), 'fixture.lesson.one.a')).toEqual({
      id: 'fixture.lesson.one.a',
      title: 'Meet the Testville Testers',
      unitTitle: 'Fixture Era One',
      minutes: 4,
      learns: ['Fixture fact a1', 'Fixture fact a2'],
      callbacks: 2,
      exercises: 5,
      recallChecks: 2,
      memoryTip: null,
    });
    expect(lessonPreview(fixtureContent(), 'fixture.lesson.nope')).toBeNull();
  });

  it('works on the real first lesson', () => {
    const preview = lessonPreview(repoContent(), 'nfl.lesson.how-teams-score');
    expect(preview?.learns).toContain('Touchdown points');
  });
});

describe('lessonStatus', () => {
  it('reports a lesson status on its own path, or null when unknown', () => {
    const input = {
      content: fixtureContent(),
      completedLessonIds: new Set(['fixture.lesson.one.a']),
      states: new Map(),
      scheduler,
      now,
    };
    expect(lessonStatus(input, 'fixture.lesson.one.a')).toBe('completed');
    expect(lessonStatus(input, 'fixture.lesson.one.b')).toBe('available');
    expect(lessonStatus(input, 'fixture.lesson.two.a')).toBe('locked');
    expect(lessonStatus(input, 'fixture.lesson.nope')).toBeNull();
  });
});

describe('awaitingReview', () => {
  it('counts facts and tips that are not yet approved', () => {
    const json = fixtureBundleJson();
    json.items[0]!.reviewStatus = 'in_review';
    expect(awaitingReview(loadBundle(json))).toBe(1);
    expect(awaitingReview(fixtureContent())).toBe(0);
  });
});
