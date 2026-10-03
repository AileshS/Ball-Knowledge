import { describe, expect, it } from 'vitest';
import { MASTERY_LEVELS } from '../src/index';

describe('retention package', () => {
  it('resolves the core workspace package', () => {
    expect(MASTERY_LEVELS).toEqual(['new', 'learning', 'familiar', 'mastered']);
  });
});
