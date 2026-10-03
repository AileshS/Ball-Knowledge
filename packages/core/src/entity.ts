import { z } from 'zod';
import { EntityIdSchema, SportIdSchema, TagSchema } from './ids';

/**
 * Entities are the people, teams, eras and moments that knowledge items are about.
 * They stay lean: facts about them (stats, dates, achievements) live in sourced
 * knowledge items, not here.
 */
const entityBase = {
  id: EntityIdSchema,
  sportId: SportIdSchema,
  name: z.string().trim().min(1),
  /** Connections used for callbacks, e.g. `team:...`, `era:...`, `position:...`. */
  tags: z.array(TagSchema).default([]),
  /** Fictional test data. Never allowed in a shipping content bundle. */
  fixture: z.boolean().optional(),
};

export const PlayerSchema = z.object({ ...entityBase, kind: z.literal('player') });
export const TeamSchema = z.object({ ...entityBase, kind: z.literal('team') });
export const CoachSchema = z.object({ ...entityBase, kind: z.literal('coach') });
export const EraSchema = z.object({
  ...entityBase,
  kind: z.literal('era'),
  /** Chronological position among the sport's eras (0 = earliest). */
  order: z.number().int().nonnegative(),
});
export const MomentSchema = z.object({ ...entityBase, kind: z.literal('moment') });

export const EntitySchema = z.discriminatedUnion('kind', [
  PlayerSchema,
  TeamSchema,
  CoachSchema,
  EraSchema,
  MomentSchema,
]);
export type Entity = z.infer<typeof EntitySchema>;
export type EntityKind = Entity['kind'];
