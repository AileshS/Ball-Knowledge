/**
 * Fictional fixtures for tests across packages (`@ball-knowledge/core/testing`).
 *
 * Every fixture is obviously made up ("Fixture Player Alpha", "Testville Testers")
 * and marked `fixture: true` where the schema allows it, so no invented sports fact
 * can be mistaken for real content (CLAUDE.md principle 4). Sources point at
 * example.com, a domain reserved for documentation.
 *
 * `*Input` builders return raw authored data (for testing invalid variants);
 * the others return parsed, typed values.
 */
import type { z } from 'zod';
import { EntitySchema, type Entity } from '../entity';
import { ExerciseSchema, type Exercise } from '../exercise';
import { KnowledgeItemSchema, type KnowledgeItem } from '../knowledge-item';
import { LessonSchema, type Lesson } from '../lesson';
import { MemoryTipSchema, type MemoryTip } from '../memory-tip';
import { SourceSchema } from '../provenance';
import { SportSchema, UnitSchema, type Sport, type Unit } from '../sport';
import {
  ReviewLogEntrySchema,
  UserItemStateSchema,
  type ReviewLogEntry,
  type UserItemState,
} from '../user-state';

export const FIXTURE_SPORT_ID = 'fixture-sport';

export const FIXTURE_SOURCE = {
  url: 'https://example.com/fixture-source',
  title: 'Fixture source (fictional, for tests only)',
  accessedAt: '2026-01-01',
} satisfies z.input<typeof SourceSchema>;

type Input<S extends z.ZodType> = z.input<S>;

export function sportInput(overrides: Partial<Input<typeof SportSchema>> = {}) {
  return {
    id: FIXTURE_SPORT_ID,
    name: 'Fixture Sport',
    status: 'live',
    ...overrides,
  } satisfies Input<typeof SportSchema>;
}
export const fixtureSport = (o: Partial<Input<typeof SportSchema>> = {}): Sport =>
  SportSchema.parse(sportInput(o));

export function unitInput(overrides: Partial<Input<typeof UnitSchema>> = {}) {
  return {
    id: 'fixture.unit.one',
    sportId: FIXTURE_SPORT_ID,
    track: 'past',
    kind: 'era',
    title: 'Fixture Era One',
    order: 0,
    tags: ['era:fixture-era-one'],
    ...overrides,
  } satisfies Input<typeof UnitSchema>;
}
export const fixtureUnit = (o: Partial<Input<typeof UnitSchema>> = {}): Unit =>
  UnitSchema.parse(unitInput(o));

export function playerInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fixture.player.alpha',
    sportId: FIXTURE_SPORT_ID,
    kind: 'player',
    name: 'Fixture Player Alpha',
    tags: ['team:testville-testers', 'era:fixture-era-one'],
    fixture: true,
    ...overrides,
  };
}
export const fixtureEntity = (o: Record<string, unknown> = {}): Entity =>
  EntitySchema.parse(playerInput(o));

export function itemInput(overrides: Partial<Input<typeof KnowledgeItemSchema>> = {}) {
  return {
    id: 'fixture.item.alpha',
    sportId: FIXTURE_SPORT_ID,
    track: 'past',
    kind: 'player',
    label: 'Fixture Player Alpha',
    statement: 'Fixture Player Alpha is a fictional player who exists only in tests.',
    whyItMatters: 'A complete, valid item that tests can tweak one field at a time.',
    entityIds: ['fixture.player.alpha'],
    tags: ['era:fixture-era-one', 'team:testville-testers'],
    availableCues: ['name', 'jersey'],
    sources: [FIXTURE_SOURCE],
    lastVerifiedAt: '2026-01-01',
    reviewStatus: 'approved',
    fixture: true,
    ...overrides,
  } satisfies Input<typeof KnowledgeItemSchema>;
}
export const fixtureItem = (o: Partial<Input<typeof KnowledgeItemSchema>> = {}): KnowledgeItem =>
  KnowledgeItemSchema.parse(itemInput(o));

export function exerciseInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fixture.exercise.alpha-team',
    type: 'multiple_choice',
    itemIds: ['fixture.item.alpha'],
    cue: 'name',
    prompt: 'Which fictional team did Fixture Player Alpha play for?',
    answer: 'Testville Testers',
    distractors: ['Mocktown Mockers', 'Stubburg Stubs'],
    fixture: true,
    ...overrides,
  };
}
export const fixtureExercise = (o: Record<string, unknown> = {}): Exercise =>
  ExerciseSchema.parse(exerciseInput(o));

export function lessonInput(overrides: Partial<Input<typeof LessonSchema>> = {}) {
  return {
    id: 'fixture.lesson.one',
    unitId: 'fixture.unit.one',
    title: 'Meet the Testville Testers',
    estimatedMinutes: 4,
    introducesItemIds: ['fixture.item.alpha'],
    exerciseIds: ['fixture.ex.1', 'fixture.ex.2', 'fixture.ex.3', 'fixture.ex.4', 'fixture.ex.5'],
    recallCheckExerciseIds: ['fixture.ex.6', 'fixture.ex.7'],
    callbackCount: 2,
    callbackHints: ['era:fixture-era-one'],
    ...overrides,
  } satisfies Input<typeof LessonSchema>;
}
export const fixtureLesson = (o: Partial<Input<typeof LessonSchema>> = {}): Lesson =>
  LessonSchema.parse(lessonInput(o));

export function memoryTipInput(overrides: Partial<Input<typeof MemoryTipSchema>> = {}) {
  return {
    id: 'fixture.tip.eras',
    sportId: FIXTURE_SPORT_ID,
    technique: 'acronym',
    itemIds: ['fixture.item.era-one', 'fixture.item.era-two'],
    title: 'Fixture eras: "OT"',
    body: 'O for One, T for Two: the fictional eras in order.',
    reviewStatus: 'approved',
    fixture: true,
    ...overrides,
  } satisfies Input<typeof MemoryTipSchema>;
}
export const fixtureMemoryTip = (o: Partial<Input<typeof MemoryTipSchema>> = {}): MemoryTip =>
  MemoryTipSchema.parse(memoryTipInput(o));

export function userItemStateInput(overrides: Partial<Input<typeof UserItemStateSchema>> = {}) {
  return {
    itemId: 'fixture.item.alpha',
    phase: 'review',
    stability: 12.5,
    difficulty: 5.2,
    due: '2026-03-01T09:00:00.000Z',
    reps: 4,
    lapses: 0,
    learningSteps: 0,
    scheduledDays: 12,
    lastReviewedAt: '2026-02-17T09:00:00.000Z',
    firstLearnedAt: '2026-01-10T09:00:00.000Z',
    cueHistory: ['name', 'jersey'],
    ...overrides,
  } satisfies Input<typeof UserItemStateSchema>;
}
export const fixtureUserItemState = (
  o: Partial<Input<typeof UserItemStateSchema>> = {},
): UserItemState => UserItemStateSchema.parse(userItemStateInput(o));

export function reviewLogEntryInput(overrides: Record<string, unknown> = {}) {
  return {
    itemId: 'fixture.item.alpha',
    reviewedAt: '2026-02-17T09:00:00.000Z',
    grade: 'good',
    correct: true,
    cue: 'name',
    exerciseType: 'multiple_choice',
    context: 'review',
    responseMs: 4200,
    daysSinceFirstLearned: 38,
    ...overrides,
  };
}
export const fixtureReviewLogEntry = (o: Record<string, unknown> = {}): ReviewLogEntry =>
  ReviewLogEntrySchema.parse(reviewLogEntryInput(o));
