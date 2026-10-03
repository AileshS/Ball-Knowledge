import { describe, expect, it } from 'vitest';
import { ExerciseSchema, normalizeAnswer, supportsTypedRecall, validate } from '../src/index';
import { exerciseInput } from '../src/testing';

const issuesFor = (overrides: Record<string, unknown>) => {
  const result = validate(ExerciseSchema, exerciseInput(overrides));
  return result.ok ? [] : result.issues;
};

describe('ExerciseSchema', () => {
  it('accepts a multiple-choice exercise', () => {
    expect(issuesFor({})).toEqual([]);
  });

  it('rejects unknown exercise types', () => {
    expect(issuesFor({ type: 'guess_the_vibe' }).length).toBeGreaterThan(0);
  });

  describe('text-first media rule (ADR 0005)', () => {
    it('requires a textFallback for photo cues', () => {
      expect(issuesFor({ type: 'identify', cue: 'photo' })).toContain(
        'textFallback: A "photo" cue requires a textFallback (ADR 0005: text-first)',
      );
      expect(
        issuesFor({
          type: 'identify',
          cue: 'photo',
          textFallback: 'A fictional player in a plain jersey.',
        }),
      ).toEqual([]);
    });

    const clip = {
      type: 'clip',
      cue: 'clip',
      clip: { embedUrl: 'https://example.com/embed/fixture', sourceName: 'Fixture League' },
      textFallback: 'A fictional last-second play described in words.',
    };

    it('accepts a clip with an https embed and a text fallback', () => {
      expect(issuesFor(clip)).toEqual([]);
    });

    it('rejects a clip without a text fallback', () => {
      expect(issuesFor({ ...clip, textFallback: undefined })).toContain(
        'textFallback: A "clip" cue requires a textFallback (ADR 0005: text-first)',
      );
    });

    it('rejects a clip exercise that does not use the clip cue', () => {
      expect(issuesFor({ ...clip, cue: 'name' })).toContain(
        'cue: Clip exercises must use the clip cue',
      );
    });

    it('rejects non-https embeds', () => {
      expect(
        issuesFor({ ...clip, clip: { ...clip.clip, embedUrl: 'http://example.com/x' } }),
      ).toContain('clip.embedUrl: Clip embedUrl must be an https URL');
    });
  });

  describe('recall-style answers', () => {
    it('needs at least 2 distractors for multiple choice', () => {
      expect(issuesFor({ distractors: ['Mocktown Mockers'] })).toContain(
        'distractors: Multiple choice needs at least 2 distractors',
      );
    });

    it('rejects a distractor that repeats the answer (case-insensitive)', () => {
      expect(issuesFor({ distractors: ['testville testers', 'Stubburg Stubs'] })).toContain(
        'distractors: Distractors must not match the answer or an accepted answer',
      );
    });

    it('rejects a distractor that is also an accepted answer (contradictory grading)', () => {
      expect(
        issuesFor({
          acceptedAnswers: ['The Testers'],
          distractors: ['the testers', 'Mocktown Mockers'],
        }),
      ).toContain('distractors: Distractors must not match the answer or an accepted answer');
    });

    it('rejects repeated distractors', () => {
      expect(issuesFor({ distractors: ['Mocktown Mockers', 'mocktown mockers'] })).toContain(
        'distractors: Distractors must be unique',
      );
    });

    it('lets identify exercises skip distractors (typed recall only)', () => {
      expect(issuesFor({ type: 'identify', distractors: [] })).toEqual([]);
    });

    it('requires fill-in-the-blank prompts to mark the blank', () => {
      expect(issuesFor({ type: 'fill_blank', prompt: 'No blank here' })).toContain(
        'prompt: Fill-in-the-blank prompts must mark the blank with "___"',
      );
      expect(
        issuesFor({ type: 'fill_blank', prompt: 'Fixture Player Alpha played for the ___.' }),
      ).toEqual([]);
    });

    it('classifies which types support typed recall', () => {
      expect(supportsTypedRecall('identify')).toBe(true);
      expect(supportsTypedRecall('match')).toBe(false);
      expect(supportsTypedRecall('timeline_order')).toBe(false);
    });
  });

  describe('structured exercise types', () => {
    it('validates match pairs', () => {
      const pairs = [
        { left: 'Fixture Player Alpha', right: 'Testville Testers' },
        { left: 'Fixture Player Beta', right: 'Mocktown Mockers' },
      ];
      expect(issuesFor({ type: 'match', pairs })).toEqual([]);
      expect(issuesFor({ type: 'match', pairs: [pairs[0]] })).toContain(
        'pairs: A match needs at least 2 pairs',
      );
      expect(issuesFor({ type: 'match', pairs: [pairs[0], pairs[0]] })).toContain(
        'pairs: Match sides must be unique',
      );
    });

    it('validates timeline events', () => {
      const events = [
        { label: 'Fixture Era One' },
        { label: 'Fixture Era Two' },
        { label: 'Fixture Era Three' },
      ];
      expect(issuesFor({ type: 'timeline_order', events })).toEqual([]);
      expect(issuesFor({ type: 'timeline_order', events: events.slice(0, 2) })).toContain(
        'events: A timeline needs at least 3 events',
      );
      expect(
        issuesFor({ type: 'timeline_order', events: [events[0], events[0], events[1]] }),
      ).toContain('events: Timeline events must be unique');
    });

    it('requires timeline event items to be tested items', () => {
      const events = [
        { label: 'Fixture Era One', itemId: 'fixture.item.alpha' },
        { label: 'Fixture Era Two', itemId: 'fixture.item.beta' },
        { label: 'Fixture Era Three' },
      ];
      expect(issuesFor({ type: 'timeline_order', events })).toContain(
        'events.1.itemId: Event item "fixture.item.beta" must also be listed in itemIds',
      );
      expect(
        issuesFor({
          type: 'timeline_order',
          events,
          itemIds: ['fixture.item.alpha', 'fixture.item.beta'],
        }),
      ).toEqual([]);
    });

    it('validates higher-or-lower sides', () => {
      const base = {
        type: 'higher_lower',
        cue: 'stat',
        metric: 'Fictional points',
        left: { label: 'Fixture Player Alpha' },
        right: { label: 'Fixture Player Beta' },
        higher: 'left',
      };
      expect(issuesFor(base)).toEqual([]);
      expect(issuesFor({ ...base, right: { label: 'fixture player alpha' } })).toContain(
        'right: Higher-or-lower needs two different sides',
      );
    });
  });

  it('rejects exercises with no items or repeated items', () => {
    expect(issuesFor({ itemIds: [] })).toContain(
      'itemIds: An exercise must test at least one item',
    );
    expect(issuesFor({ itemIds: ['fixture.item.alpha', 'fixture.item.alpha'] })).toContain(
      'itemIds: Item ids must not repeat',
    );
  });
});

describe('answer normalization shared with the app', () => {
  it('treats "The end zone" and "end zone" as the same option', () => {
    const result = validate(
      ExerciseSchema,
      exerciseInput({ answer: 'End zone', distractors: ['The end zone', 'Side zone'] }),
    );
    expect(result.ok).toBe(false);
    expect(normalizeAnswer('  The End-Zone! ')).toBe('end zone');
  });
});
