import { describe, expect, it } from 'vitest';
import { LessonSchema, MemoryTipSchema, validate } from '../src/index';
import { lessonInput, memoryTipInput } from '../src/testing';

const lessonIssues = (overrides: Parameters<typeof lessonInput>[0]) => {
  const result = validate(LessonSchema, lessonInput(overrides));
  return result.ok ? [] : result.issues;
};

describe('LessonSchema (PRD §7.4 lesson anatomy)', () => {
  it('accepts a lesson with callbacks, exercises, and a recall check', () => {
    expect(lessonIssues({})).toEqual([]);
  });

  it('requires a closing recall check', () => {
    expect(lessonIssues({ recallCheckExerciseIds: [] })).toContain(
      'recallCheckExerciseIds: Every lesson closes with a recall check',
    );
  });

  it('keeps lessons to 3-5 minutes', () => {
    expect(lessonIssues({ estimatedMinutes: 2 })[0]).toMatch(/^estimatedMinutes:/);
    expect(lessonIssues({ estimatedMinutes: 9 })[0]).toMatch(/^estimatedMinutes:/);
  });

  it('keeps lessons to 8-15 interactions including callbacks', () => {
    expect(lessonIssues({ callbackCount: 0, exerciseIds: ['fixture.ex.1'] })).toContain(
      'exerciseIds: A lesson needs 8-15 interactions (callbacks + exercises + recall check); this one has 3',
    );
    const many = Array.from({ length: 14 }, (_, i) => `fixture.ex.${i + 1}`);
    expect(lessonIssues({ exerciseIds: many })).toContain(
      'exerciseIds: A lesson needs 8-15 interactions (callbacks + exercises + recall check); this one has 18',
    );
  });

  it('does not let an exercise appear twice', () => {
    expect(
      lessonIssues({
        exerciseIds: [
          'fixture.ex.1',
          'fixture.ex.2',
          'fixture.ex.3',
          'fixture.ex.4',
          'fixture.ex.5',
        ],
        recallCheckExerciseIds: ['fixture.ex.1', 'fixture.ex.6'],
      }),
    ).toContain(
      'recallCheckExerciseIds: An exercise may appear only once per lesson (teaching or recall check)',
    );
  });

  it('allows at most one memory tip (seasoning, not the meal)', () => {
    expect(lessonIssues({ memoryTipIds: ['fixture.tip.eras'] })).toEqual([]);
    expect(lessonIssues({ memoryTipIds: ['fixture.tip.eras', 'fixture.tip.more'] })).toContain(
      'memoryTipIds: At most one memory tip per lesson',
    );
  });

  it('defaults to 2 callbacks and no tips', () => {
    const lesson = LessonSchema.parse(lessonInput({ callbackCount: undefined }));
    expect(lesson.callbackCount).toBe(2);
    expect(lesson.memoryTipIds).toEqual([]);
  });
});

describe('MemoryTipSchema', () => {
  const tipIssues = (overrides: Parameters<typeof memoryTipInput>[0]) => {
    const result = validate(MemoryTipSchema, memoryTipInput(overrides));
    return result.ok ? [] : result.issues;
  };

  it('accepts a tip for a set of items', () => {
    expect(tipIssues({})).toEqual([]);
  });

  it('is only for sets: at least 2 distinct items', () => {
    expect(tipIssues({ itemIds: ['fixture.item.era-one'] })).toContain(
      'itemIds: Memory tips are for sets: link at least 2 items',
    );
    expect(tipIssues({ itemIds: ['fixture.item.era-one', 'fixture.item.era-one'] })).toContain(
      'itemIds: Item ids must not repeat',
    );
  });

  it('only allows the four techniques', () => {
    expect(tipIssues({ technique: 'chain' })).toEqual([]);
    // @ts-expect-error: testing an invalid technique on purpose
    expect(tipIssues({ technique: 'rhyme' })[0]).toMatch(/^technique:/);
  });
});
