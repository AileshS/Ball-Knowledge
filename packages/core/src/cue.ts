import { z } from 'zod';

/**
 * The prompt through which an item is recalled. Varying cues (PRD §8) keeps recall
 * from depending on a single prompt. `photo` and `clip` cues always need a text
 * fallback (ADR 0005).
 */
export const CueSchema = z.enum(['name', 'photo', 'jersey', 'stat', 'timeline', 'clip']);
export type Cue = z.infer<typeof CueSchema>;

/** Cues that rely on licensed media and therefore require a text fallback. */
export const MEDIA_CUES: ReadonlySet<Cue> = new Set<Cue>(['photo', 'clip']);
