import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as fixtures from '../src/testing';

const SRC = join(import.meta.dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('guardrails', () => {
  it('keeps the shared domain model sport-agnostic (CLAUDE.md principle 6)', () => {
    // Sport names and sport-specific vocabulary belong in content data, not in code.
    const sportSpecific =
      /\b(nfl|nba|mlb|nhl|mls|football|basketball|baseball|hockey|soccer|quarterback|touchdown|super bowl|offensive line)\b/i;
    const offenders = sourceFiles(SRC).filter((file) =>
      sportSpecific.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('builds only fictional, clearly marked fixtures (no invented real-world facts)', () => {
    const built = [
      fixtures.fixtureEntity(),
      fixtures.fixtureItem(),
      fixtures.fixtureExercise(),
      fixtures.fixtureMemoryTip(),
    ];
    for (const value of built) expect(value.fixture).toBe(true);
    expect(
      fixtures.fixtureItem().sources.every((s) => s.url.startsWith('https://example.com/')),
    ).toBe(true);
    expect(fixtures.fixtureSport().id).toBe(fixtures.FIXTURE_SPORT_ID);
    // Remaining builders must also produce valid values.
    expect(() => [
      fixtures.fixtureUnit(),
      fixtures.fixtureLesson(),
      fixtures.fixtureUserItemState(),
      fixtures.fixtureReviewLogEntry(),
    ]).not.toThrow();
  });
});
