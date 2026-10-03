import { normalizeAnswer, type Exercise } from '@ball-knowledge/core';

// The same normalization the content checker uses (core), re-exported for screens.
export { normalizeAnswer };

/** How close a typed answer was. `typo` counts as correct, with a spelling nudge. */
export type TypedVerdict = 'exact' | 'typo' | 'wrong';

/**
 * Edit distance where insertions, deletions, substitutions, and swapping two
 * neighboring letters ("saftey") each count as one edit. Capped for speed.
 */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (before[j - 2] ?? 0) + 1);
      }
      current[j] = best;
    }
    before = previous;
    previous = current;
  }
  return previous[b.length] ?? cap + 1;
}

/** Typos allowed for an answer of this length; numbers must always be exact. */
function typoAllowance(answer: string): number {
  if (/\d/.test(answer)) return 0;
  if (answer.length >= 10) return 2;
  if (answer.length >= 5) return 1;
  return 0;
}

/**
 * Checks a typed answer against the answer and its accepted alternatives. A slip is
 * forgiven only when the input isn't just as close to one of the wrong options, so
 * "Saftey" counts but a near-copy of a distractor never earns credit.
 */
export function checkTyped(
  input: string,
  answers: readonly string[],
  wrongOptions: readonly string[] = [],
): TypedVerdict {
  const given = normalizeAnswer(input);
  if (given === '') return 'wrong';
  const targets = answers.map(normalizeAnswer);
  if (targets.includes(given)) return 'exact';
  const wrong = wrongOptions.map(normalizeAnswer);
  if (wrong.includes(given)) return 'wrong';
  const close = targets.some((t) => {
    const allowed = typoAllowance(t);
    if (allowed === 0) return false;
    const distance = editDistance(given, t, allowed);
    return distance <= allowed && wrong.every((w) => editDistance(given, w, allowed) > distance);
  });
  return close ? 'typo' : 'wrong';
}

/** The wrong options an exercise offers in recognition mode. */
export function wrongOptions(exercise: Exercise): string[] {
  return 'distractors' in exercise ? [...exercise.distractors] : [];
}

/** All the answers an exercise accepts, for typed recall. */
export function acceptedAnswers(exercise: Exercise): string[] {
  return 'answer' in exercise ? [exercise.answer, ...exercise.acceptedAnswers] : [];
}

/** True when every left item was matched to its own right item. */
export function checkMatch(
  exercise: Extract<Exercise, { type: 'match' }>,
  chosen: ReadonlyMap<string, string>,
): boolean {
  return exercise.pairs.every((p) => chosen.get(p.left) === p.right);
}

/** True when events were placed in their authored (chronological) order. */
export function checkTimeline(
  exercise: Extract<Exercise, { type: 'timeline_order' }>,
  order: readonly string[],
): boolean {
  const expected = exercise.events.map((e) => e.label);
  return order.length === expected.length && order.every((label, i) => label === expected[i]);
}
