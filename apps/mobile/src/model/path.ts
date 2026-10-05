import type { ItemId, Lesson, Sport, Track, Unit, UserItemState } from '@ball-knowledge/core';
import { unitHealth, type Scheduler, type UnitHealth } from '@ball-knowledge/retention';
import type { AppContent } from '../content/bundle';

export interface SportCard {
  readonly id: string;
  readonly name: string;
  readonly live: boolean;
}

/** Live sports first, then "coming soon" (PRD §6), each group by name. */
export function sportCards(content: AppContent): SportCard[] {
  return [...content.sports]
    .sort((a: Sport, b: Sport) =>
      a.status === b.status ? (a.name < b.name ? -1 : 1) : a.status === 'live' ? -1 : 1,
    )
    .map((s) => ({ id: s.id, name: s.name, live: s.status === 'live' }));
}

export const TRACK_INFO: Readonly<Record<Track, { title: string; blurb: string }>> = {
  foundations: {
    title: 'Foundations',
    blurb: 'Rules, positions, and how a season works. Start here.',
  },
  past: { title: 'Past', blurb: 'Eras, legends, dynasties, and iconic moments.' },
  present: {
    title: 'Present',
    blurb: "Today's players, teams, and coaches at every position.",
  },
};

export const TRACK_ORDER: readonly Track[] = ['foundations', 'past', 'present'];

export interface TrackCard {
  readonly track: Track;
  readonly title: string;
  readonly blurb: string;
  readonly unitCount: number;
  readonly lessonCount: number;
  readonly completedLessons: number;
}

export function trackCards(
  content: AppContent,
  sportId: string,
  completedLessonIds: ReadonlySet<string>,
): TrackCard[] {
  return TRACK_ORDER.map((track) => {
    const units = content.units.filter((u) => u.sportId === sportId && u.track === track);
    const unitIds = new Set(units.map((u) => u.id));
    const lessons = content.lessons.filter((l) => unitIds.has(l.unitId));
    return {
      track,
      ...TRACK_INFO[track],
      unitCount: units.length,
      lessonCount: lessons.length,
      completedLessons: lessons.filter((l) => completedLessonIds.has(l.id)).length,
    };
  });
}

export type LessonStatus = 'completed' | 'available' | 'locked';
export type UnitStatus = LessonStatus | 'coming_soon';

export interface PathLesson {
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
  readonly newItems: number;
  readonly status: LessonStatus;
}

export interface PathUnit {
  readonly id: string;
  readonly title: string;
  readonly status: UnitStatus;
  readonly lessons: readonly PathLesson[];
  readonly health: UnitHealth;
}

export interface PathInput {
  readonly content: AppContent;
  readonly sportId: string;
  readonly track: Track;
  readonly completedLessonIds: ReadonlySet<string>;
  readonly states: ReadonlyMap<ItemId, UserItemState>;
  readonly scheduler: Scheduler;
  readonly now: Date;
}

const lessonsOf = (content: AppContent, unitId: string): Lesson[] =>
  content.lessons.filter((l) => l.unitId === unitId).sort((a, b) => a.order - b.order);

/**
 * Whether a prerequisite is satisfied. A unit with no lessons yet ("coming soon")
 * has nothing to finish, so it never blocks the units after it.
 */
const isUnitComplete = (content: AppContent, unitId: string, done: ReadonlySet<string>) =>
  lessonsOf(content, unitId).every((l) => done.has(l.id));

/**
 * The learning path for one track: units in order, each with its lessons and
 * memory health. A unit opens once its prerequisite units are complete; lessons
 * inside a unit open one after another.
 */
export function learningPath(input: PathInput): PathUnit[] {
  const { content, sportId, track, completedLessonIds: done, states, scheduler, now } = input;
  return content.units
    .filter((u: Unit) => u.sportId === sportId && u.track === track)
    .sort((a, b) => a.order - b.order)
    .map((unit) => {
      const lessons = lessonsOf(content, unit.id);
      const unlocked = unit.prerequisites.every((p) => isUnitComplete(content, p, done));

      let previousDone = true;
      const pathLessons = lessons.map((lesson): PathLesson => {
        const status: LessonStatus = done.has(lesson.id)
          ? 'completed'
          : unlocked && previousDone
            ? 'available'
            : 'locked';
        previousDone = done.has(lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          minutes: lesson.estimatedMinutes,
          newItems: lesson.introducesItemIds.length,
          status,
        };
      });

      const itemIds = lessons.flatMap((l) => l.introducesItemIds);
      const health = unitHealth(
        scheduler,
        itemIds.map((id) => states.get(id) ?? scheduler.newItemState(id, now)),
        now,
      );

      const status: UnitStatus =
        lessons.length === 0
          ? 'coming_soon'
          : !unlocked
            ? 'locked'
            : pathLessons.every((l) => l.status === 'completed')
              ? 'completed'
              : 'available';
      return { id: unit.id, title: unit.title, status, lessons: pathLessons, health };
    });
}

export interface LessonPreview {
  readonly id: string;
  readonly title: string;
  readonly unitTitle: string;
  readonly minutes: number;
  /** Labels of the facts this lesson teaches. */
  readonly learns: readonly string[];
  readonly callbacks: number;
  readonly exercises: number;
  readonly recallChecks: number;
  readonly memoryTip: string | null;
}

export function lessonPreview(content: AppContent, lessonId: string): LessonPreview | null {
  const lesson = content.lessonsById.get(lessonId);
  if (!lesson) return null;
  const tipId = lesson.memoryTipIds[0];
  return {
    id: lesson.id,
    title: lesson.title,
    unitTitle: content.unitsById.get(lesson.unitId)?.title ?? '',
    minutes: lesson.estimatedMinutes,
    learns: lesson.introducesItemIds.map((id) => content.itemsById.get(id)?.label ?? id),
    callbacks: lesson.callbackCount,
    exercises: lesson.exerciseIds.length,
    recallChecks: lesson.recallCheckExerciseIds.length,
    memoryTip: tipId ? (content.tipsById.get(tipId)?.title ?? null) : null,
  };
}

/** A single lesson's status on its path, or null if the lesson doesn't exist. */
export function lessonStatus(
  input: Omit<PathInput, 'sportId' | 'track'>,
  lessonId: string,
): LessonStatus | null {
  const lesson = input.content.lessonsById.get(lessonId);
  const unit = lesson ? input.content.unitsById.get(lesson.unitId) : undefined;
  if (!unit) return null;
  const units = learningPath({ ...input, sportId: unit.sportId, track: unit.track });
  return units.flatMap((u) => u.lessons).find((l) => l.id === lessonId)?.status ?? null;
}

/**
 * True once the user has any progress in this sport (a learned fact or a completed
 * lesson). People who started before onboarding existed never see the welcome screen.
 */
export function hasStarted(
  content: AppContent,
  sportId: string,
  states: ReadonlyMap<ItemId, UserItemState>,
  completedLessonIds: Iterable<string>,
): boolean {
  for (const id of states.keys()) {
    if (content.itemsById.get(id)?.sportId === sportId) return true;
  }
  for (const id of completedLessonIds) {
    const lesson = content.lessonsById.get(id);
    if (lesson && content.unitsById.get(lesson.unitId)?.sportId === sportId) return true;
  }
  return false;
}

/** How many facts and tips still await owner review (shown as a dev banner). */
export function awaitingReview(content: AppContent): number {
  return [...content.items, ...content.tips].filter((x) => x.reviewStatus !== 'approved').length;
}
