import type { CheckMode, CheckResult, ContentSet } from './check';

/** Bumped when the bundle shape changes in a way the app must know about. */
export const BUNDLE_FORMAT_VERSION = 1;

export interface ContentBundle extends ContentSet {
  readonly formatVersion: number;
  readonly mode: CheckMode;
  /** The date the content was checked against (YYYY-MM-DD). */
  readonly builtOn: string;
}

/** Code-point comparison: identical output on every machine, whatever its locale. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = <T extends { id: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => cmp(a.id, b.id));

/**
 * Turns checked content into the bundle the app ships. Refuses if the check found
 * errors. Records are sorted by id so the same content always produces the same file.
 */
export function buildBundle(check: CheckResult, mode: CheckMode, builtOn: string): ContentBundle {
  if (check.errors.length > 0) {
    throw new Error(`Content has ${check.errors.length} error(s); fix them before building`);
  }
  const c = check.content;
  return {
    formatVersion: BUNDLE_FORMAT_VERSION,
    mode,
    builtOn,
    sports: byId(c.sports),
    // Units and lessons in path order, so the bundle reads like the learning path.
    units: [...c.units].sort(
      (a, b) =>
        cmp(a.sportId, b.sportId) || cmp(a.track, b.track) || a.order - b.order || cmp(a.id, b.id),
    ),
    entities: byId(c.entities),
    items: byId(c.items),
    exercises: byId(c.exercises),
    lessons: [...c.lessons].sort(
      (a, b) => cmp(a.unitId, b.unitId) || a.order - b.order || cmp(a.id, b.id),
    ),
    tips: byId(c.tips),
  };
}
