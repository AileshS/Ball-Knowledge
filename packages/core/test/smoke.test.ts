import { describe, expect, it } from 'vitest';
import { CORE_PACKAGE } from '../src/index';

describe('core package', () => {
  it('loads', () => {
    expect(CORE_PACKAGE).toBe('@ball-knowledge/core');
  });
});
