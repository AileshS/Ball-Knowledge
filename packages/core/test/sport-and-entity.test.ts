import { describe, expect, it } from 'vitest';
import {
  EntitySchema,
  ItemIdSchema,
  SportSchema,
  TagSchema,
  TimestampSchema,
  UnitSchema,
  validate,
} from '../src/index';
import { playerInput, sportInput, unitInput } from '../src/testing';

const issues = (result: ReturnType<typeof validate>) => (result.ok ? [] : result.issues);

describe('SportSchema', () => {
  it('accepts live and coming-soon sports', () => {
    expect(issues(validate(SportSchema, sportInput()))).toEqual([]);
    expect(issues(validate(SportSchema, sportInput({ status: 'coming_soon' })))).toEqual([]);
  });
});

describe('UnitSchema', () => {
  it('accepts a unit and defaults prerequisites', () => {
    const unit = UnitSchema.parse(unitInput());
    expect(unit.prerequisites).toEqual([]);
  });

  it('rejects self-referencing or repeated prerequisites', () => {
    expect(
      issues(validate(UnitSchema, unitInput({ prerequisites: ['fixture.unit.one'] }))),
    ).toContain('prerequisites: A unit cannot be its own prerequisite');
    expect(
      issues(
        validate(
          UnitSchema,
          unitInput({ prerequisites: ['fixture.unit.zero', 'fixture.unit.zero'] }),
        ),
      ),
    ).toContain('prerequisites: Prerequisites must not repeat');
  });

  it('rejects unknown tracks', () => {
    // @ts-expect-error: testing an invalid track on purpose
    expect(issues(validate(UnitSchema, unitInput({ track: 'future' })))[0]).toMatch(/^track:/);
  });
});

describe('EntitySchema', () => {
  it('accepts each entity kind', () => {
    for (const kind of ['player', 'team', 'coach', 'moment']) {
      expect(issues(validate(EntitySchema, playerInput({ kind })))).toEqual([]);
    }
    expect(issues(validate(EntitySchema, playerInput({ kind: 'era', order: 0 })))).toEqual([]);
  });

  it('requires eras to have a chronological order', () => {
    expect(issues(validate(EntitySchema, playerInput({ kind: 'era' })))[0]).toMatch(/^order:/);
  });
});

describe('ids, tags, and timestamps', () => {
  it('accepts slug ids and rejects others', () => {
    expect(ItemIdSchema.safeParse('fixture.item_one-a').success).toBe(true);
    for (const bad of ['', 'Upper', 'two..dots', 'trailing.', 'with space']) {
      expect(ItemIdSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('requires namespaced tags', () => {
    expect(TagSchema.safeParse('era:fixture-era-one').success).toBe(true);
    expect(TagSchema.safeParse('fixture-era-one').success).toBe(false);
    expect(TagSchema.safeParse('Era:one').success).toBe(false);
  });

  it('turns ISO strings and Dates into Dates', () => {
    const fromString = TimestampSchema.parse('2026-02-17T09:00:00.000Z');
    expect(fromString).toBeInstanceOf(Date);
    expect(fromString.toISOString()).toBe('2026-02-17T09:00:00.000Z');
    const d = new Date('2026-02-17T09:00:00Z');
    expect(TimestampSchema.parse(d)).toBe(d);
  });

  it('rejects invalid timestamps', () => {
    expect(TimestampSchema.safeParse('yesterday').success).toBe(false);
    expect(TimestampSchema.safeParse(new Date('nope')).success).toBe(false);
    expect(TimestampSchema.safeParse(1_700_000_000_000).success).toBe(false);
  });
});
