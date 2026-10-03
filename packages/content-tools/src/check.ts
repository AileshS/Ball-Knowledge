import {
  EntitySchema,
  ExerciseSchema,
  KnowledgeItemSchema,
  LessonSchema,
  MemoryTipSchema,
  SportSchema,
  UnitSchema,
  validate,
  withoutPlaceholders,
  type Entity,
  type Exercise,
  type KnowledgeItem,
  type Lesson,
  type MemoryTip,
  type Sport,
  type Unit,
} from '@ball-knowledge/core';
import type { z } from 'zod';
import type { Collection, LoadResult, RawRecord } from './load';
import { numbersIn, untracedNumbers } from './numbers';

/**
 * `dev`: what CI runs on every change. Unreviewed content is allowed (as warnings).
 * `ship`: what a release bundle needs. Everything approved, no fixtures.
 */
export type CheckMode = 'dev' | 'ship';

export interface CheckOptions {
  readonly mode: CheckMode;
  /** Today's date (YYYY-MM-DD), passed in so checks are reproducible. */
  readonly today: string;
  /** Present-track items older than this many days since verification are stale. */
  readonly presentStaleAfterDays?: number;
}

export interface Issue {
  readonly severity: 'error' | 'warning';
  /** File and record, e.g. `content/nfl/x.yaml items[2] (nfl.rules.touchdown)`. */
  readonly where: string;
  readonly message: string;
}

export interface ContentSet {
  readonly sports: Sport[];
  readonly units: Unit[];
  readonly entities: Entity[];
  readonly items: KnowledgeItem[];
  readonly exercises: Exercise[];
  readonly lessons: Lesson[];
  readonly tips: MemoryTip[];
}

export interface FreshnessEntry {
  readonly itemId: string;
  readonly lastVerifiedAt: string;
  readonly ageDays: number;
  readonly stale: boolean;
}

export interface CheckResult {
  readonly content: ContentSet;
  readonly errors: Issue[];
  readonly warnings: Issue[];
  /** Present-track items, oldest verification first (ADR 0004: keep current content fresh). */
  readonly freshness: FreshnessEntry[];
}

export const DEFAULT_PRESENT_STALE_AFTER_DAYS = 30;

const SCHEMAS = {
  sports: SportSchema,
  units: UnitSchema,
  entities: EntitySchema,
  items: KnowledgeItemSchema,
  exercises: ExerciseSchema,
  lessons: LessonSchema,
  tips: MemoryTipSchema,
} satisfies Record<Collection, z.ZodType>;

interface Located<T> {
  readonly value: T;
  readonly where: string;
}

const describe = (record: RawRecord) => {
  const id =
    typeof record.data === 'object' && record.data !== null && 'id' in record.data
      ? ` (${String(record.data.id)})`
      : '';
  return `${record.file} ${record.collection}[${record.index}]${id}`;
};

const daysBetween = (later: string, earlier: string) =>
  Math.floor((Date.parse(later) - Date.parse(earlier)) / 86_400_000);

/**
 * Validates authored content as a whole: every record against its schema, then the
 * rules that span records (references, lesson anatomy, review status, dates).
 */
export function checkContent(loaded: LoadResult, options: CheckOptions): CheckResult {
  const issues: Issue[] = [];
  const error = (where: string, message: string) =>
    issues.push({ severity: 'error', where, message });
  const warn = (where: string, message: string) =>
    issues.push({ severity: 'warning', where, message });

  for (const issue of loaded.issues) error(issue.file, issue.message);

  // 1. Schemas.
  const parsed = {
    sports: [] as Located<Sport>[],
    units: [] as Located<Unit>[],
    entities: [] as Located<Entity>[],
    items: [] as Located<KnowledgeItem>[],
    exercises: [] as Located<Exercise>[],
    lessons: [] as Located<Lesson>[],
    tips: [] as Located<MemoryTip>[],
  };
  for (const record of loaded.records) {
    const where = describe(record);
    const result = validate(SCHEMAS[record.collection], record.data);
    if (!result.ok) {
      for (const message of result.issues) error(where, message);
      continue;
    }
    (parsed[record.collection] as Located<unknown>[]).push({ value: result.value, where });
  }

  // 2. Unique ids within each collection.
  const byId = <T extends { id: string }>(list: Located<T>[], label: string) => {
    const map = new Map<string, Located<T>>();
    for (const entry of list) {
      const existing = map.get(entry.value.id);
      if (existing) error(entry.where, `Duplicate ${label} id; first defined at ${existing.where}`);
      else map.set(entry.value.id, entry);
    }
    return map;
  };
  const sports = byId(parsed.sports, 'sport');
  const units = byId(parsed.units, 'unit');
  const entities = byId(parsed.entities, 'entity');
  const items = byId(parsed.items, 'item');
  const exercises = byId(parsed.exercises, 'exercise');
  byId(parsed.lessons, 'lesson'); // reports duplicate lesson ids
  const tips = byId(parsed.tips, 'tip');

  const requireRef = (
    map: ReadonlyMap<string, unknown>,
    id: string,
    label: string,
    where: string,
  ): boolean => {
    if (map.has(id)) return true;
    error(where, `Unknown ${label} "${id}"`);
    return false;
  };

  // 3. References.
  for (const { value: unit, where } of parsed.units) {
    requireRef(sports, unit.sportId, 'sport', where);
    for (const p of unit.prerequisites) requireRef(units, p, 'prerequisite unit', where);
  }
  for (const { value: entity, where } of parsed.entities) {
    requireRef(sports, entity.sportId, 'sport', where);
  }
  for (const { value: item, where } of parsed.items) {
    requireRef(sports, item.sportId, 'sport', where);
    for (const id of item.entityIds) requireRef(entities, id, 'entity', where);
    if (item.eraId && requireRef(entities, item.eraId, 'era', where)) {
      if (entities.get(item.eraId)?.value.kind !== 'era') {
        error(where, `eraId "${item.eraId}" is not an era entity`);
      }
    }
  }
  for (const { value: exercise, where } of parsed.exercises) {
    for (const id of exercise.itemIds) requireRef(items, id, 'item', where);
  }
  for (const { value: tip, where } of parsed.tips) {
    requireRef(sports, tip.sportId, 'sport', where);
    for (const id of tip.itemIds) {
      if (requireRef(items, id, 'item', where) && items.get(id)?.value.sportId !== tip.sportId) {
        error(where, `Item "${id}" belongs to a different sport than this tip`);
      }
    }
  }

  // A prerequisite cycle would lock every unit in it forever.
  // Depth-first search; `path` holds the units on the current branch.
  const finished = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): void => {
    const loopStart = path.indexOf(id);
    if (loopStart >= 0) {
      const cycle = [...path.slice(loopStart), id];
      error(units.get(id)!.where, `Prerequisite cycle: ${cycle.join(' → ')}`);
      return;
    }
    if (finished.has(id)) return;
    path.push(id);
    for (const next of units.get(id)?.value.prerequisites ?? []) {
      if (units.has(next)) visit(next);
    }
    path.pop();
    finished.add(id);
  };
  for (const id of units.keys()) visit(id);

  // 4. Path order: no two units in a track, or lessons in a unit, share a position.
  const positions = new Map<string, string>();
  const claimPosition = (key: string, id: string, where: string) => {
    const holder = positions.get(key);
    if (holder) error(where, `Same path position as "${holder}" (${key})`);
    else positions.set(key, id);
  };
  for (const { value: unit, where } of parsed.units) {
    claimPosition(`${unit.sportId}/${unit.track} unit order ${unit.order}`, unit.id, where);
  }
  for (const { value: lesson, where } of parsed.lessons) {
    claimPosition(`${lesson.unitId} lesson order ${lesson.order}`, lesson.id, where);
  }

  // 5. Lesson anatomy across records (PRD §7.4).
  const introducedBy = new Map<string, string>();
  const usedExercises = new Set<string>();
  for (const { value: lesson, where } of parsed.lessons) {
    const unit = units.get(lesson.unitId)?.value;
    if (!requireRef(units, lesson.unitId, 'unit', where) || !unit) continue;

    const introduced = new Set<string>(lesson.introducesItemIds);
    for (const id of lesson.introducesItemIds) {
      const item = items.get(id)?.value;
      if (!requireRef(items, id, 'item', where) || !item) continue;
      const previous = introducedBy.get(id);
      if (previous) error(where, `Item "${id}" is already introduced by lesson "${previous}"`);
      else introducedBy.set(id, lesson.id);
      if (item.sportId !== unit.sportId || item.track !== unit.track) {
        error(
          where,
          `Item "${id}" is ${item.sportId}/${item.track} but unit "${unit.id}" is ${unit.sportId}/${unit.track}`,
        );
      }
    }

    const tested = new Set<string>();
    const lessonExercises = [
      ...lesson.exerciseIds.map((id) => ({ id, recall: false })),
      ...lesson.recallCheckExerciseIds.map((id) => ({ id, recall: true })),
    ];
    for (const { id, recall } of lessonExercises) {
      usedExercises.add(id);
      const exercise = exercises.get(id)?.value;
      if (!requireRef(exercises, id, 'exercise', where) || !exercise) continue;
      exercise.itemIds.forEach((itemId) => tested.add(itemId));
      if (recall && exercise.itemIds.some((itemId) => !introduced.has(itemId))) {
        error(where, `Recall check "${id}" must only test items this lesson introduces`);
      }
    }
    for (const id of introduced) {
      if (!tested.has(id)) error(where, `Introduced item "${id}" is never tested in this lesson`);
    }
    for (const id of lesson.memoryTipIds) {
      const tip = tips.get(id)?.value;
      if (requireRef(tips, id, 'memory tip', where) && tip) {
        if (!tip.itemIds.some((itemId) => introduced.has(itemId))) {
          error(where, `Memory tip "${id}" is about none of the items this lesson introduces`);
        }
      }
    }
  }
  for (const { value: item, where } of parsed.items) {
    if (!introducedBy.has(item.id)) warn(where, 'Not introduced by any lesson yet');
  }
  for (const { value: exercise, where } of parsed.exercises) {
    if (!usedExercises.has(exercise.id)) warn(where, 'Not used by any lesson yet');
  }

  // 6. Review status and fixtures: only approved, real content may ship.
  const reviewable: Located<{ reviewStatus: string; fixture?: boolean | undefined }>[] = [
    ...parsed.items,
    ...parsed.tips,
  ];
  const fixtureCarriers: Located<{ fixture?: boolean | undefined }>[] = [
    ...reviewable,
    ...parsed.entities,
    ...parsed.exercises,
  ];
  const unapproved = reviewable.filter((r) => r.value.reviewStatus !== 'approved');
  if (options.mode === 'ship') {
    for (const r of unapproved)
      error(r.where, `Status is "${r.value.reviewStatus}"; only approved content can ship`);
    for (const r of fixtureCarriers)
      if (r.value.fixture) error(r.where, 'Fixture data can never ship');
  } else {
    if (unapproved.length > 0) {
      warn(
        'content',
        `${unapproved.length} item(s)/tip(s) awaiting review; a ship build will refuse them`,
      );
    }
    for (const r of fixtureCarriers)
      if (r.value.fixture) warn(r.where, 'Fixture data (fine for tests, never ships)');
  }

  // 7. Dates and freshness.
  const staleAfter = options.presentStaleAfterDays ?? DEFAULT_PRESENT_STALE_AFTER_DAYS;
  const freshness: FreshnessEntry[] = [];
  for (const { value: item, where } of parsed.items) {
    if (item.lastVerifiedAt > options.today)
      error(where, `lastVerifiedAt ${item.lastVerifiedAt} is in the future`);
    item.sources.forEach((source, i) => {
      if (source.accessedAt > options.today) {
        error(where, `sources.${i}.accessedAt ${source.accessedAt} is in the future`);
      }
      if (!source.locator || !source.quote) {
        warn(where, `sources.${i} has no locator/quote; reviewers will have to hunt for the fact`);
      }
    });
    if (item.track === 'present') {
      const ageDays = daysBetween(options.today, item.lastVerifiedAt);
      const stale = ageDays > staleAfter;
      freshness.push({ itemId: item.id, lastVerifiedAt: item.lastVerifiedAt, ageDays, stale });
      if (stale)
        warn(
          where,
          `Last verified ${ageDays} days ago; re-verify present-track facts every ${staleAfter} days`,
        );
    }
  }
  freshness.sort((a, b) => b.ageDays - a.ageDays || (a.itemId < b.itemId ? -1 : 1));

  // 8. Every number a user sees traces back to a source (accuracy, principle 4).
  const traceable = new Map<string, Set<string>>();
  for (const { value: item, where } of parsed.items) {
    const quoted = new Set(item.sources.flatMap((s) => (s.quote ? numbersIn(s.quote) : [])));
    const derived = new Set(item.derivedValues.flatMap((d) => numbersIn(d.value)));
    for (const n of untracedNumbers(
      withoutPlaceholders(item.statement),
      new Set([...quoted, ...derived]),
    )) {
      error(
        where,
        `Number "${n}" in the statement isn't in any source quote; quote it, or list it in derivedValues with how it was computed`,
      );
    }
    traceable.set(
      item.id,
      new Set([...numbersIn(withoutPlaceholders(item.statement)), ...derived]),
    );
  }
  for (const { value: exercise, where } of parsed.exercises) {
    const allowed = new Set(exercise.itemIds.flatMap((id) => [...(traceable.get(id) ?? [])]));
    const shown: [string, string][] = [['prompt', exercise.prompt]];
    if (exercise.textFallback) shown.push(['textFallback', exercise.textFallback]);
    if ('answer' in exercise) {
      shown.push(['answer', exercise.answer]);
      exercise.acceptedAnswers.forEach((a, i) => shown.push([`acceptedAnswers.${i}`, a]));
    }
    if (exercise.type === 'match') {
      exercise.pairs.forEach((p, i) => shown.push([`pairs.${i}`, `${p.left} ${p.right}`]));
    }
    if (exercise.type === 'higher_lower' && exercise.explanation) {
      shown.push(['explanation', exercise.explanation]);
    }
    for (const [field, text] of shown) {
      for (const n of untracedNumbers(text, allowed)) {
        error(where, `Number "${n}" in ${field} doesn't appear in the tested items' statements`);
      }
    }
  }

  const values = <T>(list: Located<T>[]) => list.map((l) => l.value);
  return {
    content: {
      sports: values(parsed.sports),
      units: values(parsed.units),
      entities: values(parsed.entities),
      items: values(parsed.items),
      exercises: values(parsed.exercises),
      lessons: values(parsed.lessons),
      tips: values(parsed.tips),
    },
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    freshness,
  };
}
