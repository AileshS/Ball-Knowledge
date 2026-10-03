import { z } from 'zod';

/**
 * Content IDs are stable, human-readable slugs that content authors write by hand,
 * e.g. `foundations.scoring.points-basics`. Lowercase letters and digits, separated
 * by single `.`, `-` or `_`.
 */
const SLUG = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const slug = (label: string) =>
  z
    .string()
    .regex(
      SLUG,
      `${label} must be lowercase letters/digits separated by ".", "-" or "_" (e.g. "foundations.scoring.basics")`,
    );

// Branded so an ItemId can never be passed where an EntityId is expected.
export const SportIdSchema = slug('Sport id').brand<'SportId'>();
export const UnitIdSchema = slug('Unit id').brand<'UnitId'>();
export const LessonIdSchema = slug('Lesson id').brand<'LessonId'>();
export const ExerciseIdSchema = slug('Exercise id').brand<'ExerciseId'>();
export const ItemIdSchema = slug('Knowledge item id').brand<'ItemId'>();
export const EntityIdSchema = slug('Entity id').brand<'EntityId'>();
export const MemoryTipIdSchema = slug('Memory tip id').brand<'MemoryTipId'>();

export type SportId = z.infer<typeof SportIdSchema>;
export type UnitId = z.infer<typeof UnitIdSchema>;
export type LessonId = z.infer<typeof LessonIdSchema>;
export type ExerciseId = z.infer<typeof ExerciseIdSchema>;
export type ItemId = z.infer<typeof ItemIdSchema>;
export type EntityId = z.infer<typeof EntityIdSchema>;
export type MemoryTipId = z.infer<typeof MemoryTipIdSchema>;

/**
 * Namespaced, sport-agnostic tags that connect content for callbacks and grouping,
 * e.g. `era:example-era`, `position:example-group`, `team:example-team`.
 * The namespaces and values are content data; code never hard-codes a sport's tags.
 */
export const TagSchema = z
  .string()
  .regex(
    /^[a-z][a-z_]*:[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    'Tag must look like "namespace:value" (e.g. "position:example-group")',
  )
  .brand<'Tag'>();
export type Tag = z.infer<typeof TagSchema>;

/** Calendar date authored by a person, e.g. `2026-10-02`. */
export const IsoDateSchema = z.iso.date('Must be a date like 2026-10-02');
export type IsoDate = z.infer<typeof IsoDateSchema>;

/**
 * A point in time. Accepts a `Date` or an ISO-8601 datetime string with an offset
 * (as stored in JSON) and always yields a valid `Date`.
 */
export const TimestampSchema = z
  .union([z.date(), z.iso.datetime({ offset: true }).transform((s) => new Date(s))])
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid timestamp');

/** Rejects lists that contain the same value twice. */
export function hasNoDuplicates(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}
