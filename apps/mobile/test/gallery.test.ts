import { checkContent, parseContentFile } from '@ball-knowledge/content-tools';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  ALL_EXERCISE_TYPES,
  GALLERY_JSON,
  galleryContent,
  galleryQuestions,
} from '../src/dev/gallery';

describe('dev exercise gallery', () => {
  const content = galleryContent();

  it('shows every exercise type and every drawable or described cue', () => {
    expect(new Set(content.exercises.map((e) => e.type))).toEqual(new Set(ALL_EXERCISE_TYPES));
    expect(content.exercises.some((e) => e.visual?.kind === 'jersey')).toBe(true);
    expect(content.exercises.some((e) => e.cue === 'photo' && e.textFallback)).toBe(true);
    expect(content.exercises.some((e) => e.cue === 'clip' && e.textFallback)).toBe(true);
  });

  it('is clearly fictional and passes the content checker (numbers included)', () => {
    expect(content.items.every((i) => i.fixture)).toBe(true);
    expect(content.exercises.every((e) => e.fixture)).toBe(true);
    const { sports, units, entities, items, exercises } = GALLERY_JSON;
    const result = checkContent(
      parseContentFile(stringify({ sports, units, entities, items, exercises }), 'gallery.yaml'),
      { mode: 'dev', today: '2026-10-05' },
    );
    expect(result.errors).toEqual([]);
  });

  it('builds a question for each exercise in both formats', () => {
    const choice = galleryQuestions(content, false);
    const typed = galleryQuestions(content, true);
    expect(choice).toHaveLength(content.exercises.length);
    expect(choice.find((q) => q.exerciseId === 'gallery.ex.identify-jersey')?.format).toBe(
      'choice',
    );
    expect(typed.find((q) => q.exerciseId === 'gallery.ex.identify-jersey')?.format).toBe('typed');
    expect(typed.find((q) => q.exerciseId === 'gallery.ex.match')?.format).toBe('match');
    expect(typed.find((q) => q.exerciseId === 'gallery.ex.timeline')?.format).toBe('timeline');
  });
});
