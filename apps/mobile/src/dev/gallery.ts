/**
 * A dev-only practice set showing every exercise type and cue. Everything here is
 * obviously fictional ("Testville Testers") and marked `fixture`: it never enters
 * the content bundle and nothing played here is saved.
 */
import type { ExerciseType, ItemId } from '@ball-knowledge/core';
import { createScheduler, createSeededRng } from '@ball-knowledge/retention';
import { loadBundle, type AppContent } from '../content/bundle';
import { questionFor, type QuestionStep } from '../session/plan';

const source = {
  url: 'https://example.com/fixture-source',
  title: 'Fixture source (fictional, for the dev gallery only)',
  accessedAt: '2026-01-01',
};

const item = (id: string, label: string, statement: string) => ({
  id,
  sportId: 'fixture-sport',
  track: 'past',
  kind: 'player',
  label,
  statement,
  whyItMatters: 'A fictional fact for trying out question types.',
  availableCues: ['name', 'jersey', 'photo', 'clip', 'stat', 'timeline'],
  // Even fictional facts trace their numbers to a quote, like real content must.
  sources: [{ ...source, locator: 'Fictional page 1', quote: statement }],
  lastVerifiedAt: '2026-01-01',
  reviewStatus: 'approved',
  fixture: true,
});

const ALPHA = 'gallery.alpha';
const BETA = 'gallery.beta';
const ERAS = 'gallery.eras';

export const GALLERY_JSON = {
  formatVersion: 1,
  mode: 'dev',
  builtOn: '2026-01-01',
  sports: [{ id: 'fixture-sport', name: 'Fixture Sport', status: 'live' }],
  units: [
    {
      id: 'gallery.unit',
      sportId: 'fixture-sport',
      track: 'past',
      kind: 'era',
      title: 'Exercise gallery',
      order: 0,
    },
  ],
  entities: [],
  items: [
    item(
      ALPHA,
      'Fixture Player Alpha',
      'Fixture Player Alpha wore number 12 for the Testville Testers.',
    ),
    item(
      BETA,
      'Fixture Player Beta',
      'Fixture Player Beta wore number 7 for the Mocktown Mockers.',
    ),
    item(ERAS, 'Fixture eras', 'The fictional eras run Dawn, then Middle, then Modern.'),
  ],
  exercises: [
    {
      id: 'gallery.ex.multiple-choice',
      type: 'multiple_choice',
      itemIds: [ALPHA],
      cue: 'name',
      prompt: 'Which fictional team did Fixture Player Alpha play for?',
      answer: 'Testville Testers',
      distractors: ['Mocktown Mockers', 'Stubburg Stubs'],
      fixture: true,
    },
    {
      id: 'gallery.ex.identify-jersey',
      type: 'identify',
      itemIds: [ALPHA],
      cue: 'jersey',
      visual: { kind: 'jersey', number: '12' },
      prompt: 'Which fictional player wore this number for the Testville Testers?',
      answer: 'Fixture Player Alpha',
      acceptedAnswers: ['Alpha'],
      distractors: ['Fixture Player Beta', 'Fixture Player Gamma'],
      fixture: true,
    },
    {
      id: 'gallery.ex.identify-photo',
      type: 'identify',
      itemIds: [BETA],
      cue: 'photo',
      textFallback:
        'A fictional player in a plain Mocktown Mockers jersey, number 7, mid-celebration.',
      prompt: 'Who is described here?',
      answer: 'Fixture Player Beta',
      acceptedAnswers: ['Beta'],
      distractors: ['Fixture Player Alpha', 'Fixture Player Gamma'],
      fixture: true,
    },
    {
      id: 'gallery.ex.who-did-it',
      type: 'who_did_it',
      itemIds: [BETA],
      cue: 'name',
      prompt: 'Who wore number 7 for the Mocktown Mockers?',
      answer: 'Fixture Player Beta',
      acceptedAnswers: ['Beta'],
      distractors: ['Fixture Player Alpha', 'Fixture Player Gamma'],
      fixture: true,
    },
    {
      id: 'gallery.ex.fill-blank',
      type: 'fill_blank',
      itemIds: [ALPHA],
      cue: 'stat',
      prompt: 'Fixture Player Alpha wore number ___.',
      answer: '12',
      acceptedAnswers: ['twelve'],
      distractors: ['7', '21'],
      fixture: true,
    },
    {
      id: 'gallery.ex.match',
      type: 'match',
      itemIds: [ALPHA, BETA],
      cue: 'name',
      prompt: 'Match each fictional player to their team.',
      pairs: [
        { left: 'Fixture Player Alpha', right: 'Testville Testers' },
        { left: 'Fixture Player Beta', right: 'Mocktown Mockers' },
      ],
      fixture: true,
    },
    {
      id: 'gallery.ex.timeline',
      type: 'timeline_order',
      itemIds: [ERAS],
      cue: 'timeline',
      prompt: 'Put the fictional eras in order, earliest first.',
      events: [{ label: 'Dawn era' }, { label: 'Middle era' }, { label: 'Modern era' }],
      fixture: true,
    },
    {
      id: 'gallery.ex.higher-lower',
      type: 'higher_lower',
      itemIds: [ALPHA, BETA],
      cue: 'stat',
      prompt: 'Who wore the higher jersey number?',
      metric: 'Jersey number',
      left: { label: 'Fixture Player Alpha' },
      right: { label: 'Fixture Player Beta' },
      higher: 'left',
      explanation: 'Alpha wore 12; Beta wore 7.',
      fixture: true,
    },
    {
      id: 'gallery.ex.clip',
      type: 'clip',
      itemIds: [BETA],
      cue: 'clip',
      clip: {
        embedUrl: 'https://example.com/embed/fictional-moment',
        sourceName: 'Fixture League',
      },
      textFallback:
        'In a fictional final, number 7 of the Mocktown Mockers catches a long pass as time expires.',
      prompt: 'Who made the fictional catch?',
      answer: 'Fixture Player Beta',
      acceptedAnswers: ['Beta'],
      distractors: ['Fixture Player Alpha', 'Fixture Player Gamma'],
      fixture: true,
    },
  ],
  lessons: [],
  tips: [],
};

/** Every exercise type the app supports, for checking the gallery is complete. */
export const ALL_EXERCISE_TYPES: readonly ExerciseType[] = [
  'multiple_choice',
  'identify',
  'match',
  'timeline_order',
  'higher_lower',
  'who_did_it',
  'fill_blank',
  'clip',
];

export function galleryContent(): AppContent {
  return loadBundle(GALLERY_JSON);
}

/**
 * One question per gallery exercise. `typed` asks recall-style ones as typed
 * answers instead of options, to try both formats.
 */
export function galleryQuestions(content: AppContent, typed: boolean): QuestionStep[] {
  const scheduler = createScheduler();
  const rng = createSeededRng(7);
  return content.exercises.map((exercise) =>
    questionFor(
      exercise,
      typed ? 'recall' : 'learn',
      new Map<ItemId, never>(),
      scheduler,
      rng,
      `gallery:${exercise.id}`,
    ),
  );
}
