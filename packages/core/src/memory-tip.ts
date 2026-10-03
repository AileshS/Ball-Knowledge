import { z } from 'zod';
import { hasNoDuplicates, ItemIdSchema, MemoryTipIdSchema, SportIdSchema } from './ids';
import { ReviewStatusSchema } from './provenance';

/** Memory OS-inspired techniques (PRD §8, "Memory tips"). */
export const MemoryTechniqueSchema = z.enum(['acronym', 'chain', 'story', 'palace']);
export type MemoryTechnique = z.infer<typeof MemoryTechniqueSchema>;

/**
 * An optional, dismissible mnemonic for a *set* of items (ordered or grouped
 * content like the sequence of eras). Shown when the content is introduced and
 * again in review after a miss. Reviewed like any other content: a tip must never
 * distort the facts it anchors.
 */
export const MemoryTipSchema = z
  .object({
    id: MemoryTipIdSchema,
    sportId: SportIdSchema,
    technique: MemoryTechniqueSchema,
    itemIds: z.array(ItemIdSchema).min(2, 'Memory tips are for sets: link at least 2 items'),
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    reviewStatus: ReviewStatusSchema,
    /** Fictional test data. Never allowed in a shipping content bundle. */
    fixture: z.boolean().optional(),
  })
  .superRefine((tip, ctx) => {
    if (!hasNoDuplicates(tip.itemIds)) {
      ctx.addIssue({ code: 'custom', path: ['itemIds'], message: 'Item ids must not repeat' });
    }
  });
export type MemoryTip = z.infer<typeof MemoryTipSchema>;
