import { z } from 'zod';
import { CueSchema } from './cue';
import {
  DataRefSchema,
  hasMalformedPlaceholder,
  placeholderKeys,
  withoutPlaceholders,
} from './data-ref';
import {
  EntityIdSchema,
  hasNoDuplicates,
  IsoDateSchema,
  ItemIdSchema,
  SportIdSchema,
  TagSchema,
} from './ids';
import { ReviewStatusSchema, SourceSchema } from './provenance';
import { TrackSchema } from './sport';

export const ItemKindSchema = z.enum([
  'player',
  'team',
  'coach',
  'era',
  'moment',
  'stat',
  'rule',
  'contract',
]);
export type ItemKind = z.infer<typeof ItemKindSchema>;

/** Item kinds whose numbers change over time and must come from a data provider. */
const PROVIDER_BACKED_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['stat', 'contract']);

/**
 * The atomic fact a user learns and is scheduled on. Every item carries its
 * sources and when it was last verified (CLAUDE.md principle 4) and a memorable
 * "why it matters" line (elaboration hook, PRD §8).
 */
export const KnowledgeItemSchema = z
  .object({
    id: ItemIdSchema,
    sportId: SportIdSchema,
    track: TrackSchema,
    kind: ItemKindSchema,
    /** Short name for lists and the mastery map, e.g. "Points for a basic score". */
    label: z.string().trim().min(1),
    /** The fact itself. Provider-backed values appear as `{{key}}` placeholders. */
    statement: z.string().trim().min(1),
    whyItMatters: z.string().trim().min(1, 'Every item needs a "why it matters" hook'),
    entityIds: z.array(EntityIdSchema).default([]),
    tags: z.array(TagSchema).default([]),
    eraId: EntityIdSchema.optional(),
    /** Season label such as "2025" or "2025-26". */
    season: z
      .string()
      .regex(/^\d{4}(?:-\d{2}|-\d{4})?$/, 'Season must look like "2025" or "2025-26"')
      .optional(),
    availableCues: z.array(CueSchema).min(1, 'An item needs at least one cue'),
    dataRefs: z.array(DataRefSchema).default([]),
    sources: z.array(SourceSchema).min(1, 'Every fact needs at least one source'),
    lastVerifiedAt: IsoDateSchema,
    reviewStatus: ReviewStatusSchema,
    /** Fictional test data. Never allowed in a shipping content bundle. */
    fixture: z.boolean().optional(),
  })
  .superRefine((item, ctx) => {
    if (!hasNoDuplicates(item.availableCues)) {
      ctx.addIssue({ code: 'custom', path: ['availableCues'], message: 'Cues must not repeat' });
    }
    if (!hasNoDuplicates(item.entityIds)) {
      ctx.addIssue({ code: 'custom', path: ['entityIds'], message: 'Entity ids must not repeat' });
    }

    const refKeys = item.dataRefs.map((ref) => ref.key);
    if (!hasNoDuplicates(refKeys)) {
      ctx.addIssue({ code: 'custom', path: ['dataRefs'], message: 'DataRef keys must be unique' });
    }
    if (hasMalformedPlaceholder(item.statement)) {
      ctx.addIssue({
        code: 'custom',
        path: ['statement'],
        message: 'Malformed placeholder; use {{camelCaseKey}} with a matching dataRef',
      });
    }
    for (const field of ['label', 'whyItMatters'] as const) {
      if (item[field].includes('{{') || item[field].includes('}}')) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Placeholders are only supported in statement',
        });
      }
    }
    const used = placeholderKeys(item.statement);
    for (const key of used) {
      if (!refKeys.includes(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['statement'],
          message: `Placeholder {{${key}}} has no matching dataRef`,
        });
      }
    }
    for (const key of refKeys) {
      if (!used.includes(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dataRefs'],
          message: `dataRef "${key}" is never used in the statement`,
        });
      }
    }

    // Present-track stats and contracts are referenced by ID from a data provider,
    // never typed into lesson text (CLAUDE.md domain model, ADR 0004).
    if (item.track === 'present' && PROVIDER_BACKED_KINDS.has(item.kind)) {
      if (item.dataRefs.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['dataRefs'],
          message: `Present-track ${item.kind} items must reference provider data via dataRefs`,
        });
      }
      if (/\d/.test(withoutPlaceholders(item.statement))) {
        ctx.addIssue({
          code: 'custom',
          path: ['statement'],
          message: `Present-track ${item.kind} statements must not contain literal numbers; use {{placeholders}}`,
        });
      }
      // Label and hook are user-facing too, and can't hold placeholders.
      for (const field of ['label', 'whyItMatters'] as const) {
        if (/\d/.test(item[field])) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: `Present-track ${item.kind} items must not put literal numbers in ${field}; keep values in the statement's {{placeholders}}`,
          });
        }
      }
    }
  });
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;
