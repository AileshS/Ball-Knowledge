import { z } from 'zod';

/**
 * A pointer to a value held by a sports-data provider (ADR 0004), so stats and
 * contracts can refresh without rewriting lessons. Statements embed the value with
 * a `{{key}}` placeholder that matches `key`.
 */
export const DataRefSchema = z.object({
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'DataRef key must be a simple identifier like "capHit"'),
  provider: z.string().trim().min(1),
  resource: z.string().trim().min(1),
  id: z.string().trim().min(1),
  field: z.string().trim().min(1),
});
export type DataRef = z.infer<typeof DataRefSchema>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** Placeholder keys used in a statement, e.g. "Signed for {{apy}} per year" -> ["apy"]. */
export function placeholderKeys(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? '');
}

/** The statement with every `{{placeholder}}` removed, for literal-value checks. */
export function withoutPlaceholders(text: string): string {
  return text.replace(PLACEHOLDER, '');
}

/**
 * True when text contains `{{`/`}}` that isn't a well-formed placeholder, e.g. a
 * typo like `{{cap_hit}}` that would otherwise reach users as raw braces.
 */
export function hasMalformedPlaceholder(text: string): boolean {
  const rest = withoutPlaceholders(text);
  return rest.includes('{{') || rest.includes('}}');
}
