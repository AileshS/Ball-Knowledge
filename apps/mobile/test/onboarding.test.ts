import { ReviewLogEntrySchema, type ItemId, type UserItemState } from '@ball-knowledge/core';
import { lessonInput, unitInput } from '@ball-knowledge/core/testing';
import { createScheduler, createSeededRng } from '@ball-knowledge/retention';
import { describe, expect, it } from 'vitest';
import { loadBundle, type AppContent } from '../src/content/bundle';
import { hasStarted } from '../src/model/path';
import { MemoryStore } from '../src/progress/store';
import {
  MAX_PLACEMENT_QUESTIONS,
  placedLessons,
  planPlacement,
  scorePlacement,
} from '../src/session/placement';
import {
  chooseTrack,
  markOnboarded,
  readPreferences,
  trackOrder,
  withPreference,
} from '../src/session/preferences';
import { startOfLocalDay, todaySummary } from '../src/session/today';
import { fixtureBundleJson, repoContent } from './helpers';

const scheduler = createScheduler();
const content = repoContent();
const T = new Date('2026-10-04T15:00:00Z');
const noStates = new Map<ItemId, UserItemState>();
const plan = (overrides: Partial<Parameters<typeof planPlacement>[0]> = {}) =>
  planPlacement({
    content,
    sportId: 'nfl',
    states: noStates,
    completedLessonIds: new Set(),
    scheduler,
    rng: createSeededRng(1),
    ...overrides,
  });

describe('planPlacement', () => {
  it('asks one typed question per Foundations fact, whole lessons in path order up to the cap', () => {
    const p = plan();
    const unitOrder = new Map(content.units.map((u) => [u.id, u.order]));
    const lessons = content.lessons
      .filter((l) => l.unitId.startsWith('nfl.foundations'))
      .sort((a, b) => unitOrder.get(a.unitId)! - unitOrder.get(b.unitId)! || a.order - b.order);
    const placed = lessons.slice(0, p.lessonIds.length);
    expect(p.lessonIds).toEqual(placed.map((l) => l.id));
    expect(p.steps.map((s) => s.itemIds[0])).toEqual(placed.flatMap((l) => l.introducesItemIds));
    expect(p.steps.every((s) => s.phase === 'placement' && s.format === 'typed')).toBe(true);
    expect(p.steps.length).toBeLessThanOrEqual(MAX_PLACEMENT_QUESTIONS);
    // It stopped only because the next whole lesson wouldn't fit.
    const next = lessons[p.lessonIds.length];
    if (next) {
      expect(p.steps.length + next.introducesItemIds.length).toBeGreaterThan(
        MAX_PLACEMENT_QUESTIONS,
      );
    }
  });

  it('prefers the lesson recall check for a fact', () => {
    const step = plan().steps.find((s) => s.itemIds[0] === 'nfl.rules.field-goal-points');
    expect(step?.exerciseId).toBe('nfl.ex.scoring.recall-three-points');
  });

  it('stops before a lesson that would go over the cap, and skips completed lessons', () => {
    expect(plan({ maxQuestions: 5 }).lessonIds).toEqual(['nfl.lesson.how-teams-score']);
    expect(plan({ maxQuestions: 3 }).steps).toEqual([]);
    const skipped = plan({ completedLessonIds: new Set(['nfl.lesson.how-teams-score']) }).lessonIds;
    expect(skipped[0]).toBe('nfl.lesson.field-and-the-try');
    expect(skipped).not.toContain('nfl.lesson.how-teams-score');
    expect(plan({ sportId: 'nba' }).steps).toEqual([]);
  });

  it('skips a lesson it cannot fully cover', () => {
    const json = fixtureBundleJson();
    json.units.push(
      unitInput({ id: 'fixture.unit.basics', track: 'foundations', kind: 'topic', order: 1 }),
    );
    json.lessons.push(
      lessonInput({
        id: 'fixture.lesson.basics',
        unitId: 'fixture.unit.basics',
        order: 0,
        introducesItemIds: ['fixture.item.a1'],
      }),
    );
    const p = planPlacement({
      content: loadBundle(json),
      sportId: 'fixture-sport',
      states: noStates,
      completedLessonIds: new Set(),
      scheduler,
      rng: createSeededRng(1),
    });
    expect(p).toEqual({ steps: [], lessonIds: [], lessonOf: new Map() });
  });
});

describe('placement scoring and results', () => {
  const p = plan();
  const step = p.steps[0]!;
  const exercise = content.exercisesById.get(step.exerciseId)!;

  it('grades a correct answer Easy, so the fact gets a long first interval', () => {
    const [result] = scorePlacement(scheduler, noStates, step, exercise, true, T);
    expect(result?.logEntry).toMatchObject({ grade: 'easy', context: 'placement', correct: true });
    expect(ReviewLogEntrySchema.safeParse(result?.logEntry).success).toBe(true);
    expect(result!.state.phase).toBe('review');
    expect(result!.state.due.getTime() - T.getTime()).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it('records nothing for a wrong answer (the lesson will teach it)', () => {
    expect(scorePlacement(scheduler, noStates, step, exercise, false, T)).toEqual([]);
  });

  it('places out of a lesson only when every fact in it was right', () => {
    const first = content.lessonsById.get('nfl.lesson.how-teams-score')!;
    const second = content.lessonsById.get('nfl.lesson.field-and-the-try')!;
    const answers = new Map<ItemId, boolean>();
    for (const id of first.introducesItemIds) answers.set(id, true);
    for (const id of second.introducesItemIds) answers.set(id, true);
    answers.set(second.introducesItemIds[0]!, false);
    expect(placedLessons(p, answers)).toEqual([first.id]);
    expect(placedLessons(p, new Map())).toEqual([]);
  });
});

describe('preferences', () => {
  it('remembers onboarding and the chosen track per sport', async () => {
    const store = new MemoryStore();
    expect(await readPreferences(store, 'nfl')).toEqual({ onboarded: false, track: null });
    await markOnboarded(store, 'nfl');
    await chooseTrack(store, 'nfl', 'present');
    expect(await readPreferences(store, 'nfl')).toEqual({ onboarded: true, track: 'present' });
    expect(await readPreferences(store, 'nba')).toEqual({ onboarded: false, track: null });
    await store.set('bk:pref:track:nba', 'future');
    expect((await readPreferences(store, 'nba')).track).toBeNull();
  });

  it('updates the choices of one sport in memory without touching others', () => {
    const before = new Map([['nba', { onboarded: true, track: 'past' as const }]]);
    const after = withPreference(before, 'nfl', { onboarded: true });
    expect(after.get('nfl')).toEqual({ onboarded: true, track: null });
    expect(after.get('nba')).toEqual({ onboarded: true, track: 'past' });
    expect(withPreference(after, 'nfl', { track: 'present' }).get('nfl')).toEqual({
      onboarded: true,
      track: 'present',
    });
    expect(before.has('nfl')).toBe(false);
  });

  it('orders tracks: Foundations, the chosen one, then the other', () => {
    expect(trackOrder(null)).toEqual(['foundations', 'past', 'present']);
    expect(trackOrder('past')).toEqual(['foundations', 'past', 'present']);
    expect(trackOrder('present')).toEqual(['foundations', 'present', 'past']);
  });
});

describe('next lesson follows the chosen track', () => {
  const json = fixtureBundleJson();
  json.units.push(unitInput({ id: 'fixture.unit.now', track: 'present', kind: 'team', order: 0 }));
  json.lessons.push(
    lessonInput({
      id: 'fixture.lesson.now.a',
      unitId: 'fixture.unit.now',
      order: 0,
      introducesItemIds: ['fixture.item.c1'],
    }),
  );
  // fixture.lesson.two.a also introduces c1; give it another fact so content stays valid.
  json.lessons.find((l) => l.id === 'fixture.lesson.two.a')!.introducesItemIds = [
    'fixture.item.b1',
  ];
  const withPresent: AppContent = loadBundle(json);
  const summary = (chosenTrack: 'past' | 'present' | null) =>
    todaySummary({
      content: withPresent,
      sportId: 'fixture-sport',
      states: noStates,
      completedLessons: new Map(),
      log: [],
      scheduler,
      now: T,
      dayStart: startOfLocalDay(T),
      chosenTrack,
    }).nextLesson?.id;

  it('comes from Past by default, and from Present once chosen', () => {
    expect(summary(null)).toBe('fixture.lesson.one.a');
    expect(summary('past')).toBe('fixture.lesson.one.a');
    expect(summary('present')).toBe('fixture.lesson.now.a');
  });
});

describe('hasStarted', () => {
  it('is true once a fact or lesson in that sport has progress', () => {
    const itemId = 'nfl.rules.touchdown-points' as ItemId;
    const state = scheduler.newItemState(itemId, T);
    expect(hasStarted(content, 'nfl', noStates, [])).toBe(false);
    expect(hasStarted(content, 'nfl', new Map([[itemId, state]]), [])).toBe(true);
    expect(hasStarted(content, 'nfl', noStates, ['nfl.lesson.how-teams-score'])).toBe(true);
    expect(
      hasStarted(content, 'nba', new Map([[itemId, state]]), ['nfl.lesson.how-teams-score']),
    ).toBe(false);
    expect(hasStarted(content, 'nfl', noStates, ['unknown.lesson'])).toBe(false);
  });
});
