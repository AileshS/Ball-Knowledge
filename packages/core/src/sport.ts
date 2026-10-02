import { z } from 'zod';
import { hasNoDuplicates, SportIdSchema, TagSchema, UnitIdSchema } from './ids';

export const SportSchema = z.object({
  id: SportIdSchema,
  name: z.string().trim().min(1),
  /** Only one sport is live in v1; others show as "coming soon" (PRD §6). */
  status: z.enum(['live', 'coming_soon']),
});
export type Sport = z.infer<typeof SportSchema>;

/** The three learning tracks every sport has (PRD §7). */
export const TrackSchema = z.enum(['foundations', 'past', 'present']);
export type Track = z.infer<typeof TrackSchema>;

/**
 * Generic unit shapes that apply to any sport. Which eras, position groups or
 * teams exist is content data, never an enum here.
 */
export const UnitKindSchema = z.enum([
  'topic', // a Foundations topic: rules, positions, season structure, stats
  'era', // Past: an era overview
  'era_deep_dive', // Past: superstars, coaches and dynasties of one era
  'moments', // Past: iconic plays and games
  'debate', // Past: context and stats for classic arguments
  'position_group', // Present: one position group
  'team', // Present: a team, its coaches and core roster
  'trade_value', // Present: "Is this trade worth it?"
]);
export type UnitKind = z.infer<typeof UnitKindSchema>;

export const UnitSchema = z
  .object({
    id: UnitIdSchema,
    sportId: SportIdSchema,
    track: TrackSchema,
    kind: UnitKindSchema,
    title: z.string().trim().min(1),
    /** Position on the learning path within its track. */
    order: z.number().int().nonnegative(),
    prerequisites: z.array(UnitIdSchema).default([]),
    /** What the unit is about, e.g. its era or position group; used for callbacks. */
    tags: z.array(TagSchema).default([]),
  })
  .superRefine((unit, ctx) => {
    if (unit.prerequisites.includes(unit.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['prerequisites'],
        message: 'A unit cannot be its own prerequisite',
      });
    }
    if (!hasNoDuplicates(unit.prerequisites)) {
      ctx.addIssue({
        code: 'custom',
        path: ['prerequisites'],
        message: 'Prerequisites must not repeat',
      });
    }
  });
export type Unit = z.infer<typeof UnitSchema>;
