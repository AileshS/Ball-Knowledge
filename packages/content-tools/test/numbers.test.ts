import { describe, expect, it } from 'vitest';
import { numbersIn, untracedNumbers } from '../src/index';
import { baseContent, check, messages } from './helpers';

describe('numbersIn', () => {
  it('finds digits, decimals, fractions, and number words', () => {
    expect(numbersIn('6 points, 2.5 yards, 53⅓ yards, two yards, Fifteen')).toEqual([
      '6',
      '2.5',
      '53⅓',
      '2',
      '15',
    ]);
  });

  it('drops thousands separators and ignores words inside other words', () => {
    expect(numbersIn('1,000 fans; someone; tenth')).toEqual(['1000']);
  });

  it('reports only numbers missing from the allowed set, once each', () => {
    expect(untracedNumbers('6 or 7, then 7 again', new Set(['6']))).toEqual(['7']);
  });
});

describe('number tracing in checkContent', () => {
  const withQuote = (statement: string, quote: string, derived: object[] = []) => {
    const content = baseContent();
    Object.assign(content.items[0]!, {
      statement,
      derivedValues: derived,
      sources: [{ ...content.items[0]!.sources[0]!, quote }],
    });
    return messages(check(content).errors);
  };

  it('accepts statements whose numbers are all quoted', () => {
    expect(withQuote('A fictional score is worth 6 points.', 'Fictional score: 6 points')).toEqual(
      [],
    );
    expect(withQuote('It starts 2 yards out.', 'two yards from the fictional line')).toEqual([]);
  });

  it('rejects a number that is not in any quote', () => {
    expect(
      withQuote('A fictional score is worth 7 points.', 'Fictional score: 6 points'),
    ).toContain(
      'Number "7" in the statement isn\'t in any source quote; quote it, or list it in derivedValues with how it was computed',
    );
  });

  it('accepts numbers declared as derived', () => {
    expect(
      withQuote('It is 90 feet (30 yards) long.', 'is 90 feet in length', [
        { value: '30', from: '90 feet ÷ 3' },
      ]),
    ).toEqual([]);
  });

  it('rejects exercise prompts and answers with numbers the tested facts do not contain', () => {
    const content = baseContent();
    Object.assign(content.items[0]!, {
      statement: 'A fictional score is worth 6 points.',
      sources: [{ ...content.items[0]!.sources[0]!, quote: 'Fictional score: 6 points' }],
    });
    Object.assign(content.exercises[0]!, {
      prompt: 'Is a fictional score worth 6 points or 8 points?',
      answer: '7',
      distractors: ['5', '9'],
    });
    const errors = messages(check(content).errors);
    expect(errors).toContain(
      'Number "8" in prompt doesn\'t appear in the tested items\' statements',
    );
    expect(errors).toContain(
      'Number "7" in answer doesn\'t appear in the tested items\' statements',
    );
    // Distractors are wrong on purpose, so their numbers are never traced.
    expect(errors.some((e) => e.includes('"5"') || e.includes('"9"'))).toBe(false);
  });
});

describe('jersey numbers trace to the tested facts', () => {
  it('rejects a jersey number that no tested statement contains', () => {
    const content = baseContent();
    Object.assign(content.items[0]!, {
      statement: 'Fixture Player Alpha wore the fictional number 12.',
      sources: [{ ...content.items[0]!.sources[0]!, quote: 'Alpha: number 12' }],
    });
    Object.assign(content.exercises[0]!, {
      type: 'identify',
      cue: 'jersey',
      prompt: 'Which fictional player wore this jersey?',
      answer: 'Fixture Player Alpha',
      distractors: [],
      visual: { kind: 'jersey', number: '21' },
    });
    expect(messages(check(content).errors)).toContain(
      'Number "21" in visual.number doesn\'t appear in the tested items\' statements',
    );
    Object.assign(content.exercises[0]!, { visual: { kind: 'jersey', number: '12' } });
    expect(check(content).errors).toEqual([]);
  });
});
