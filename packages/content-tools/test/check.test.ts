import { describe, expect, it } from 'vitest';
import { FIXTURE_SOURCE } from '@ball-knowledge/core/testing';
import { baseContent, check, messages, type Content } from './helpers';

const errorsFor = (mutate: (c: Content) => void, options = {}) => {
  const content = baseContent();
  mutate(content);
  return messages(check(content, options).errors);
};

describe('checkContent', () => {
  it('accepts a valid content set, noting fixtures as dev-only warnings', () => {
    const result = check(baseContent());
    expect(result.errors).toEqual([]);
    expect(result.content.items).toHaveLength(2);
    expect(messages(result.warnings)).toContain('Fixture data (fine for tests, never ships)');
  });

  it('reports schema problems with the file and record', () => {
    const result = check({ ...baseContent(), items: [{ id: 'fixture.item.alpha', sources: [] }] });
    const issue = result.errors.find((e) => e.message.startsWith('sources:'));
    expect(issue?.where).toBe('test.yaml items[0] (fixture.item.alpha)');
  });

  it('rejects duplicate ids', () => {
    expect(errorsFor((c) => c.items.push({ ...c.items[0]! }))).toContainEqual(
      expect.stringMatching(/^Duplicate item id; first defined at test.yaml items\[0\]/),
    );
  });

  describe('references', () => {
    it.each([
      ['unit sport', (c: Content) => (c.units[0]!.sportId = 'nope'), 'Unknown sport "nope"'],
      [
        'prerequisite',
        (c: Content) => (c.units[0]!.prerequisites = ['fixture.unit.zero']),
        'Unknown prerequisite unit "fixture.unit.zero"',
      ],
      [
        'item entity',
        (c: Content) => (c.items[0]!.entityIds = ['fixture.player.ghost']),
        'Unknown entity "fixture.player.ghost"',
      ],
      [
        'exercise item',
        (c: Content) => (c.exercises[0]!.itemIds = ['fixture.item.ghost']),
        'Unknown item "fixture.item.ghost"',
      ],
      [
        'lesson unit',
        (c: Content) => (c.lessons[0]!.unitId = 'fixture.unit.ghost'),
        'Unknown unit "fixture.unit.ghost"',
      ],
      [
        'lesson exercise',
        (c: Content) =>
          (c.lessons[0]!.exerciseIds = [
            'fixture.ex.1',
            'fixture.ex.2',
            'fixture.ex.3',
            'fixture.ex.4',
            'fixture.ex.99',
          ]),
        'Unknown exercise "fixture.ex.99"',
      ],
      [
        'lesson tip',
        (c: Content) => (c.lessons[0]!.memoryTipIds = ['fixture.tip.ghost']),
        'Unknown memory tip "fixture.tip.ghost"',
      ],
    ])('flags an unknown %s', (_, mutate, message) => {
      expect(errorsFor(mutate)).toContain(message);
    });

    it('rejects prerequisite cycles, which would lock units forever', () => {
      const errors = errorsFor((c) => {
        const [unit] = c.units;
        c.units.push(
          { ...unit!, id: 'fixture.unit.two', order: 1, prerequisites: ['fixture.unit.three'] },
          { ...unit!, id: 'fixture.unit.three', order: 2, prerequisites: ['fixture.unit.two'] },
        );
      });
      expect(errors.filter((e) => e.startsWith('Prerequisite cycle'))).toEqual([
        'Prerequisite cycle: fixture.unit.two → fixture.unit.three → fixture.unit.two',
      ]);
    });

    it('accepts a prerequisite chain without cycles', () => {
      const errors = errorsFor((c) => {
        const [unit] = c.units;
        c.units.push(
          { ...unit!, id: 'fixture.unit.two', order: 1, prerequisites: ['fixture.unit.one'] },
          {
            ...unit!,
            id: 'fixture.unit.three',
            order: 2,
            prerequisites: ['fixture.unit.one', 'fixture.unit.two'],
          },
        );
      });
      expect(errors).toEqual([]);
    });

    it('requires eraId to point at an era', () => {
      expect(errorsFor((c) => (c.items[0]!.eraId = 'fixture.player.alpha'))).toContain(
        'eraId "fixture.player.alpha" is not an era entity',
      );
      expect(errorsFor((c) => (c.items[0]!.eraId = 'fixture.era.one'))).toEqual([]);
    });

    it('keeps memory tips within one sport', () => {
      const errors = errorsFor((c) => {
        c.sports.push({ ...c.sports[0]!, id: 'other-sport' });
        c.tips[0]!.sportId = 'other-sport';
      });
      expect(errors).toContain(
        'Item "fixture.item.alpha" belongs to a different sport than this tip',
      );
    });
  });

  describe('lesson anatomy', () => {
    it('rejects an item introduced by two lessons', () => {
      const errors = errorsFor((c) =>
        c.lessons.push({ ...c.lessons[0]!, id: 'fixture.lesson.two', order: 1 }),
      );
      expect(errors).toContain(
        'Item "fixture.item.alpha" is already introduced by lesson "fixture.lesson.one"',
      );
    });

    it('rejects two lessons at the same path position', () => {
      const errors = errorsFor((c) =>
        c.lessons.push({
          ...c.lessons[0]!,
          id: 'fixture.lesson.two',
          introducesItemIds: ['fixture.item.gamma'],
        }),
      );
      expect(errors).toContainEqual(
        expect.stringMatching(/^Same path position as "fixture.lesson.one"/),
      );
    });

    it('requires recall checks to test only the lesson’s own items', () => {
      const errors = errorsFor((c) => (c.lessons[0]!.introducesItemIds = ['fixture.item.alpha']));
      expect(errors).toContain(
        'Recall check "fixture.ex.7" must only test items this lesson introduces',
      );
    });

    it('requires every introduced item to be tested', () => {
      const errors = errorsFor((c) => {
        c.items.push({ ...c.items[0]!, id: 'fixture.item.gamma' });
        c.lessons[0]!.introducesItemIds = [
          'fixture.item.alpha',
          'fixture.item.beta',
          'fixture.item.gamma',
        ];
      });
      expect(errors).toContain(
        'Introduced item "fixture.item.gamma" is never tested in this lesson',
      );
    });

    it('keeps introduced items in the unit’s sport and track', () => {
      const errors = errorsFor((c) => (c.items[1]!.track = 'foundations'));
      expect(errors).toContain(
        'Item "fixture.item.beta" is fixture-sport/foundations but unit "fixture.unit.one" is fixture-sport/past',
      );
    });

    it('rejects a memory tip about none of the lesson’s items', () => {
      const errors = errorsFor((c) => {
        c.items.push(
          { ...c.items[0]!, id: 'fixture.item.gamma' },
          { ...c.items[0]!, id: 'fixture.item.delta' },
        );
        c.tips[0]!.itemIds = ['fixture.item.gamma', 'fixture.item.delta'];
      });
      expect(errors).toContain(
        'Memory tip "fixture.tip.pair" is about none of the items this lesson introduces',
      );
    });

    it('warns about items and exercises no lesson uses yet', () => {
      const content = baseContent();
      content.items.push({ ...content.items[0]!, id: 'fixture.item.gamma' });
      content.exercises.push({ ...content.exercises[0]!, id: 'fixture.ex.8' });
      const warnings = check(content).warnings;
      const warningFor = (id: string) => warnings.find((w) => w.where.endsWith(`(${id})`))?.message;
      expect(warningFor('fixture.item.gamma')).toBe('Not introduced by any lesson yet');
      expect(warningFor('fixture.ex.8')).toBe('Not used by any lesson yet');
    });
  });

  describe('ship mode', () => {
    it('refuses fixtures and anything not approved', () => {
      const content = baseContent();
      content.items[1]!.reviewStatus = 'in_review';
      const errors = messages(check(content, { mode: 'ship' }).errors);
      expect(errors).toContain('Status is "in_review"; only approved content can ship');
      expect(errors).toContain('Fixture data can never ship');
    });

    it('accepts approved, real content', () => {
      const content = baseContent();
      for (const list of [content.items, content.tips, content.entities, content.exercises]) {
        for (const record of list as { fixture?: boolean }[]) delete record.fixture;
      }
      expect(check(content, { mode: 'ship' }).errors).toEqual([]);
    });

    it('in dev mode, summarizes what still awaits review', () => {
      const content = baseContent();
      content.items[0]!.reviewStatus = 'draft';
      expect(messages(check(content).warnings)).toContain(
        '1 item(s)/tip(s) awaiting review; a ship build will refuse them',
      );
    });
  });

  describe('dates and freshness', () => {
    it('rejects verification and access dates in the future', () => {
      const errors = errorsFor((c) => {
        c.items[0]!.lastVerifiedAt = '2026-10-03';
        c.items[0]!.sources = [{ ...c.items[0]!.sources[0]!, accessedAt: '2026-12-25' }];
      });
      expect(errors).toContain('lastVerifiedAt 2026-10-03 is in the future');
      expect(errors).toContain('sources.0.accessedAt 2026-12-25 is in the future');
    });

    it('warns when a source lacks a locator or quote', () => {
      const content = baseContent();
      const item = content.items[0] as { sources: object[] };
      item.sources = [{ ...FIXTURE_SOURCE, locator: 'Fixture page 1' }]; // no quote
      expect(messages(check(content).warnings)).toContain(
        'sources.0 has no locator/quote; reviewers will have to hunt for the fact',
      );
    });

    it('reports present-track freshness, oldest first, flagging stale items', () => {
      const content = baseContent();
      content.units[0]!.track = 'present';
      content.units[0]!.kind = 'team';
      content.items[0]!.track = 'present';
      content.items[0]!.lastVerifiedAt = '2026-08-01';
      content.items[1]!.track = 'present';
      content.items[1]!.lastVerifiedAt = '2026-09-25';
      const result = check(content);
      expect(result.errors).toEqual([]);
      expect(result.freshness).toEqual([
        { itemId: 'fixture.item.alpha', lastVerifiedAt: '2026-08-01', ageDays: 62, stale: true },
        { itemId: 'fixture.item.beta', lastVerifiedAt: '2026-09-25', ageDays: 7, stale: false },
      ]);
      expect(messages(result.warnings)).toContain(
        'Last verified 62 days ago; re-verify present-track facts every 30 days',
      );
      expect(check(content, { presentStaleAfterDays: 90 }).freshness.every((f) => !f.stale)).toBe(
        true,
      );
    });
  });
});
