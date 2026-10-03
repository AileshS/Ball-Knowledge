import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUNDLE_FORMAT_VERSION,
  buildBundle,
  checkContent,
  loadContentDir,
  parseContentFile,
} from '../src/index';
import { baseContent, check, TODAY } from './helpers';

describe('parseContentFile', () => {
  it('reads collections, skips x- anchor holders, and supports merge keys', () => {
    const yaml = [
      'x-sources:',
      '  base: &base { url: https://example.com/a, title: A }',
      'sports:',
      '  - { id: fixture-sport, name: Fixture Sport, status: live }',
      'items:',
      '  - sources:',
      '      - <<: *base',
      '        quote: hello',
    ].join('\n');
    const { records, issues } = parseContentFile(yaml, 'f.yaml');
    expect(issues).toEqual([]);
    expect(records.map((r) => r.collection)).toEqual(['sports', 'items']);
    expect(records[1]!.data).toEqual({
      sources: [{ url: 'https://example.com/a', title: 'A', quote: 'hello' }],
    });
  });

  it.each([
    ['unknown collections', 'players: []', 'Unknown collection "players"'],
    ['non-list collections', 'items: { id: x }', '"items" must be a list'],
    ['a top-level list', '- id: x', 'Top level must be a map of collections'],
  ])('reports %s', (_, yaml, message) => {
    const { issues } = parseContentFile(yaml, 'f.yaml');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: 'f.yaml' });
    expect(issues[0]!.message.startsWith(message)).toBe(true);
  });

  it('reports YAML syntax errors and accepts empty files', () => {
    expect(parseContentFile('items: [unclosed', 'f.yaml').issues).toHaveLength(1);
    expect(parseContentFile('', 'f.yaml')).toEqual({ records: [], issues: [] });
  });
});

describe('buildBundle', () => {
  it('refuses to build content with errors', () => {
    const result = check({ ...baseContent(), units: [] });
    expect(() => buildBundle(result, 'dev', TODAY)).toThrow(/error\(s\); fix them/);
  });

  it('builds a deterministic, sorted bundle', () => {
    const content = baseContent();
    content.items.reverse();
    const bundle = buildBundle(check(content), 'dev', TODAY);
    expect(bundle).toMatchObject({
      formatVersion: BUNDLE_FORMAT_VERSION,
      mode: 'dev',
      builtOn: TODAY,
    });
    expect(bundle.items.map((i) => i.id)).toEqual(['fixture.item.alpha', 'fixture.item.beta']);
    expect(JSON.stringify(buildBundle(check(baseContent()), 'dev', TODAY))).toBe(
      JSON.stringify(bundle),
    );
  });
});

describe('buildBundle ordering', () => {
  it('lists units by track and order, and lessons by unit and order', () => {
    const content = baseContent();
    const [unit] = content.units;
    const [lesson] = content.lessons;
    content.units.push(
      { ...unit!, id: 'fixture.unit.zero', order: 1 },
      { ...unit!, id: 'fixture.unit.f', track: 'foundations', kind: 'topic', order: 0 },
    );
    content.lessons.unshift({
      ...lesson!,
      id: 'fixture.lesson.later',
      order: 1,
      introducesItemIds: ['fixture.item.beta'],
      exerciseIds: ['fixture.ex.2', 'fixture.ex.4', 'fixture.ex.3', 'fixture.ex.5', 'fixture.ex.1'],
      recallCheckExerciseIds: ['fixture.ex.7'],
      memoryTipIds: [],
    });
    content.lessons[1]!.introducesItemIds = ['fixture.item.alpha'];
    content.lessons[1]!.exerciseIds = [
      'fixture.ex.1',
      'fixture.ex.3',
      'fixture.ex.5',
      'fixture.ex.2',
      'fixture.ex.4',
    ];
    content.lessons[1]!.recallCheckExerciseIds = ['fixture.ex.6'];
    content.lessons[1]!.callbackCount = 3;
    content.lessons[0]!.callbackCount = 3;
    const result = check(content);
    expect(result.errors).toEqual([]);
    const bundle = buildBundle(result, 'dev', TODAY);
    expect(bundle.units.map((u) => u.id)).toEqual([
      'fixture.unit.f',
      'fixture.unit.one',
      'fixture.unit.zero',
    ]);
    expect(bundle.lessons.map((l) => l.id)).toEqual(['fixture.lesson.one', 'fixture.lesson.later']);
  });
});

describe('the repository content', () => {
  const dir = join(import.meta.dirname, '..', '..', '..', 'content');
  const result = checkContent(loadContentDir(dir), { mode: 'dev', today: TODAY });

  it('passes the dev check with no errors', () => {
    expect(result.errors).toEqual([]);
    expect(result.content.lessons.length).toBeGreaterThan(0);
  });

  it('cites a locator and verbatim quote for every fact', () => {
    for (const item of result.content.items) {
      expect(item.sources.length).toBeGreaterThan(0);
      for (const source of item.sources) {
        expect(source.locator, item.id).toBeTruthy();
        expect(source.quote, item.id).toBeTruthy();
      }
    }
  });

  it('contains no fixtures', () => {
    expect(result.content.items.some((i) => i.fixture)).toBe(false);
    expect(result.content.exercises.some((e) => e.fixture)).toBe(false);
  });
});
