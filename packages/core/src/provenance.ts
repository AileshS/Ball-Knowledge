import { z } from 'zod';
import { IsoDateSchema } from './ids';

/**
 * Where a fact came from. Every knowledge item needs at least one (accuracy is
 * non-negotiable: CLAUDE.md principle 4).
 */
export const SourceSchema = z.object({
  url: z.url({ protocol: /^https?$/, error: 'Source url must be an http(s) URL' }),
  title: z.string().trim().min(1, 'Source title is required'),
  publisher: z.string().trim().min(1).optional(),
  accessedAt: IsoDateSchema,
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Editorial workflow. Only `approved` content may ship; the content validator
 * (Phase 4) enforces that for production bundles.
 */
export const ReviewStatusSchema = z.enum(['draft', 'in_review', 'approved']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
