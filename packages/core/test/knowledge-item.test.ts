import { describe, expect, it } from 'vitest';
import { KnowledgeItemSchema, placeholderKeys, validate, withoutPlaceholders } from '../src/index';
import { FIXTURE_SOURCE, itemInput } from '../src/testing';

const issuesFor = (overrides: Parameters<typeof itemInput>[0]) => {
  const result = validate(KnowledgeItemSchema, itemInput(overrides));
  return result.ok ? [] : result.issues;
};

describe('KnowledgeItemSchema', () => {
  it('accepts a complete item and applies defaults', () => {
    const result = validate(
      KnowledgeItemSchema,
      itemInput({ tags: undefined, dataRefs: undefined }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags).toEqual([]);
      expect(result.value.dataRefs).toEqual([]);
    }
  });

  it('requires at least one source (accuracy is non-negotiable)', () => {
    expect(issuesFor({ sources: [] })).toContain('sources: Every fact needs at least one source');
  });

  it('requires a valid http(s) source url and a date', () => {
    const issues = issuesFor({
      sources: [{ ...FIXTURE_SOURCE, url: 'ftp://example.com/x', accessedAt: 'last week' }],
    });
    expect(issues).toContain('sources.0.url: Source url must be an http(s) URL');
    expect(issues).toContain('sources.0.accessedAt: Must be a date like 2026-10-02');
  });

  it('requires lastVerifiedAt and a why-it-matters hook', () => {
    const issues = issuesFor({ lastVerifiedAt: '', whyItMatters: '   ' });
    expect(issues.some((i) => i.startsWith('lastVerifiedAt:'))).toBe(true);
    expect(issues).toContain('whyItMatters: Every item needs a "why it matters" hook');
  });

  it('rejects malformed ids with a helpful message', () => {
    const [issue] = issuesFor({ id: 'Fixture Item!' });
    expect(issue).toMatch(/^id: Knowledge item id must be lowercase/);
  });

  it('rejects duplicate cues and entity ids', () => {
    const issues = issuesFor({
      availableCues: ['name', 'name'],
      entityIds: ['fixture.player.alpha', 'fixture.player.alpha'],
    });
    expect(issues).toContain('availableCues: Cues must not repeat');
    expect(issues).toContain('entityIds: Entity ids must not repeat');
  });

  it('validates season labels', () => {
    expect(issuesFor({ season: '2025-26' })).toEqual([]);
    expect(issuesFor({ season: '2025' })).toEqual([]);
    expect(issuesFor({ season: 'the 2025 season' })[0]).toMatch(/^season:/);
  });

  describe('data references (ADR 0004)', () => {
    const metricRef = {
      key: 'metric',
      provider: 'fixture',
      resource: 'season_stats',
      id: 'alpha',
      field: 'points',
    };
    const presentStat = {
      track: 'present' as const,
      kind: 'stat' as const,
      label: 'Fixture Player Alpha fictional metric',
      statement: 'Fixture Player Alpha recorded {{metric}} fictional points.',
      dataRefs: [metricRef],
    };

    it('accepts a present-track stat whose value comes from a provider', () => {
      expect(issuesFor(presentStat)).toEqual([]);
    });

    it('rejects present-track stats and contracts without dataRefs', () => {
      for (const kind of ['stat', 'contract'] as const) {
        const issues = issuesFor({
          ...presentStat,
          kind,
          statement: 'A fictional value.',
          dataRefs: [],
        });
        expect(issues).toContain(
          `dataRefs: Present-track ${kind} items must reference provider data via dataRefs`,
        );
      }
    });

    it('rejects literal numbers in present-track stat statements', () => {
      const issues = issuesFor({
        ...presentStat,
        statement: 'Fixture Player Alpha recorded {{metric}} points in 12 fictional games.',
      });
      expect(issues).toContain(
        'statement: Present-track stat statements must not contain literal numbers; use {{placeholders}}',
      );
    });

    it('allows numbers in past-track statements (historical facts are sourced, not provider-fed)', () => {
      expect(
        issuesFor({ statement: 'Fixture Player Alpha wore the fictional number 99.' }),
      ).toEqual([]);
    });

    it('requires placeholders and dataRefs to match exactly', () => {
      const missing = issuesFor({
        ...presentStat,
        statement: 'Scored {{other}} fictional points.',
      });
      expect(missing).toContain('statement: Placeholder {{other}} has no matching dataRef');
      expect(missing).toContain('dataRefs: dataRef "metric" is never used in the statement');
    });

    it('rejects duplicate dataRef keys', () => {
      const issues = issuesFor({ ...presentStat, dataRefs: [metricRef, metricRef] });
      expect(issues).toContain('dataRefs: DataRef keys must be unique');
    });

    it('rejects literal numbers in the label and hook of present-track stats', () => {
      const issues = issuesFor({
        ...presentStat,
        label: 'A fictional 50-point season',
        whyItMatters: 'It reset the fictional market at 3 times the old rate.',
      });
      expect(issues.filter((i) => /must not put literal numbers in/.test(i))).toHaveLength(2);
      expect(issues.some((i) => i.startsWith('label:'))).toBe(true);
      expect(issues.some((i) => i.startsWith('whyItMatters:'))).toBe(true);
    });

    it('catches malformed placeholders instead of shipping raw braces', () => {
      for (const statement of [
        'Signed for {{cap_hit}} per fictional year.',
        'Signed for {{cap-hit}} per fictional year.',
        'Signed for {{capHit per fictional year.',
        'Signed for capHit}} per fictional year.',
      ]) {
        expect(issuesFor({ statement })).toContain(
          'statement: Malformed placeholder; use {{camelCaseKey}} with a matching dataRef',
        );
      }
    });

    it('only allows placeholders in the statement', () => {
      const issues = issuesFor({ ...presentStat, label: 'Alpha {{metric}}' });
      expect(issues).toContain('label: Placeholders are only supported in statement');
    });
  });
});

describe('placeholder helpers', () => {
  it('extracts keys and strips placeholders', () => {
    const text = 'Signed for {{ apy }} per year over {{years}} years';
    expect(placeholderKeys(text)).toEqual(['apy', 'years']);
    expect(withoutPlaceholders(text)).toBe('Signed for  per year over  years');
  });
});
