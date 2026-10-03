import { describe, expect, it } from 'vitest';
import { RETENTION_DEPENDS_ON, RETENTION_PACKAGE } from '../src/index';

describe('retention package', () => {
  it('loads and resolves the core workspace package', () => {
    expect(RETENTION_PACKAGE).toBe('@ball-knowledge/retention');
    expect(RETENTION_DEPENDS_ON).toBe('@ball-knowledge/core');
  });
});
