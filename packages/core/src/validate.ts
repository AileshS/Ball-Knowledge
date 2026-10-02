import type { z } from 'zod';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/**
 * Validates data and returns readable issues ("path: message") instead of throwing,
 * so content tools can report every problem in an authored file at once.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  data: unknown,
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.map(String).join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}
