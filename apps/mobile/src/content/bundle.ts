import {
  EntitySchema,
  ExerciseSchema,
  KnowledgeItemSchema,
  LessonSchema,
  MemoryTipSchema,
  SportSchema,
  UnitSchema,
  type Entity,
  type Exercise,
  type KnowledgeItem,
  type Lesson,
  type MemoryTip,
  type Sport,
  type Unit,
} from '@ball-knowledge/core';
import { z } from 'zod';

/**
 * The bundle written by `npm run content:build`. It was fully checked at build
 * time; the app re-parses it with the core schemas anyway, so every value is typed
 * (branded ids included) and a stale or hand-edited bundle fails loudly at startup.
 */
const BundleSchema = z.object({
  formatVersion: z.literal(1),
  mode: z.enum(['dev', 'ship']),
  builtOn: z.string(),
  sports: z.array(SportSchema),
  units: z.array(UnitSchema),
  entities: z.array(EntitySchema),
  items: z.array(KnowledgeItemSchema),
  exercises: z.array(ExerciseSchema),
  lessons: z.array(LessonSchema),
  tips: z.array(MemoryTipSchema),
});

export interface AppContent {
  readonly mode: 'dev' | 'ship';
  readonly builtOn: string;
  readonly sports: readonly Sport[];
  readonly units: readonly Unit[];
  readonly entities: readonly Entity[];
  readonly items: readonly KnowledgeItem[];
  readonly exercises: readonly Exercise[];
  readonly lessons: readonly Lesson[];
  readonly tips: readonly MemoryTip[];
  readonly itemsById: ReadonlyMap<string, KnowledgeItem>;
  readonly exercisesById: ReadonlyMap<string, Exercise>;
  readonly lessonsById: ReadonlyMap<string, Lesson>;
  readonly unitsById: ReadonlyMap<string, Unit>;
  readonly tipsById: ReadonlyMap<string, MemoryTip>;
}

const index = <T extends { id: string }>(list: readonly T[]) =>
  new Map<string, T>(list.map((x) => [x.id, x]));

/** Parses and indexes a content bundle. Throws with readable issues if it's malformed. */
export function loadBundle(json: unknown): AppContent {
  const result = BundleSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Content bundle is invalid (run npm run content:build): ${issues}`);
  }
  const b = result.data;
  return {
    mode: b.mode,
    builtOn: b.builtOn,
    sports: b.sports,
    units: b.units,
    entities: b.entities,
    items: b.items,
    exercises: b.exercises,
    lessons: b.lessons,
    tips: b.tips,
    itemsById: index(b.items),
    exercisesById: index(b.exercises),
    lessonsById: index(b.lessons),
    unitsById: index(b.units),
    tipsById: index(b.tips),
  };
}
