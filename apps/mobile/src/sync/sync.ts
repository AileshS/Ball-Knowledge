import {
  ReviewLogEntrySchema,
  type ItemId,
  type LessonId,
  type ReviewLogEntry,
  type UserItemState,
} from '@ball-knowledge/core';
import type { Scheduler } from '@ball-knowledge/retention';
import type { ProgressRepository } from '../progress/repository';

/** A review-log row as stored in Supabase (snake_case, ISO timestamps). */
export interface RemoteLogRow {
  readonly id: string;
  readonly item_id: string;
  readonly reviewed_at: string;
  readonly grade: string;
  readonly correct: boolean;
  readonly cue: string;
  readonly exercise_type: string;
  readonly context: string;
  readonly response_ms: number | null;
  readonly days_since_first_learned: number;
}

export interface RemoteLessonRow {
  readonly lesson_id: string;
  readonly completed_at: string;
}

/** What sync needs from the server. Supabase implements it; tests use a fake. */
export interface SyncRemote {
  pullLog(): Promise<RemoteLogRow[]>;
  /** Inserts rows, ignoring any the server already has (same id). */
  pushLog(rows: readonly RemoteLogRow[]): Promise<void>;
  pullLessons(): Promise<RemoteLessonRow[]>;
  pushLessons(rows: readonly RemoteLessonRow[]): Promise<void>;
}

/**
 * A stable id for one answer: the same answer always gets the same id, on every
 * device, so pushing it twice is harmless. No randomness needed.
 */
export function logEntryId(entry: Pick<ReviewLogEntry, 'itemId' | 'reviewedAt'>): string {
  return `${entry.itemId}@${entry.reviewedAt.toISOString()}`;
}

export function toRemoteRow(entry: ReviewLogEntry): RemoteLogRow {
  return {
    id: logEntryId(entry),
    item_id: entry.itemId,
    reviewed_at: entry.reviewedAt.toISOString(),
    grade: entry.grade,
    correct: entry.correct,
    cue: entry.cue,
    exercise_type: entry.exerciseType,
    context: entry.context,
    response_ms: entry.responseMs ?? null,
    days_since_first_learned: entry.daysSinceFirstLearned,
  };
}

/** Parses a server row; returns null for anything malformed rather than trusting it. */
export function fromRemoteRow(row: RemoteLogRow): ReviewLogEntry | null {
  const result = ReviewLogEntrySchema.safeParse({
    itemId: row.item_id,
    reviewedAt: new Date(row.reviewed_at),
    grade: row.grade,
    correct: row.correct,
    cue: row.cue,
    exerciseType: row.exercise_type,
    context: row.context,
    ...(row.response_ms === null ? {} : { responseMs: row.response_ms }),
    daysSinceFirstLearned: row.days_since_first_learned,
  });
  return result.success ? result.data : null;
}

/**
 * Rebuilds every item's memory state from the review log. The scheduler is
 * deterministic, so replaying the merged log from all devices gives every device
 * the same state (ADR 0003).
 */
export function replayStates(
  scheduler: Scheduler,
  entries: readonly ReviewLogEntry[],
): Map<ItemId, UserItemState> {
  const states = new Map<ItemId, UserItemState>();
  const ordered = [...entries].sort(
    (a, b) =>
      a.reviewedAt.getTime() - b.reviewedAt.getTime() || (logEntryId(a) < logEntryId(b) ? -1 : 1),
  );
  for (const entry of ordered) {
    const previous =
      states.get(entry.itemId) ?? scheduler.newItemState(entry.itemId, entry.reviewedAt);
    const { state } = scheduler.applyReview(previous, {
      grade: entry.grade,
      now: entry.reviewedAt,
      cue: entry.cue,
      exerciseType: entry.exerciseType,
      context: entry.context,
      ...(entry.responseMs === undefined ? {} : { responseMs: entry.responseMs }),
    });
    states.set(entry.itemId, state);
  }
  return states;
}

export interface SyncResult {
  readonly pushedAnswers: number;
  readonly pulledAnswers: number;
  readonly pushedLessons: number;
  readonly pulledLessons: number;
}

/**
 * Two-way sync: send answers and lessons the server lacks, bring down ones this
 * device lacks, then rebuild memory state from the merged log if anything new
 * arrived. Safe to run any number of times; nothing is ever deleted.
 */
export async function syncProgress(
  repository: ProgressRepository,
  remote: SyncRemote,
  scheduler: Scheduler,
): Promise<SyncResult> {
  const [localLog, local, remoteRows, remoteLessons] = await Promise.all([
    repository.reviewLog(),
    repository.load(),
    remote.pullLog(),
    remote.pullLessons(),
  ]);

  const remoteIds = new Set(remoteRows.map((r) => r.id));
  const localIds = new Set(localLog.map(logEntryId));

  const toPush = localLog.filter((e) => !remoteIds.has(logEntryId(e))).map(toRemoteRow);
  if (toPush.length > 0) await remote.pushLog(toPush);

  const incoming = remoteRows
    .filter((r) => !localIds.has(r.id))
    .map(fromRemoteRow)
    .filter((e): e is ReviewLogEntry => e !== null);
  if (incoming.length > 0) await repository.importLog(incoming);
  // Always rebuild from the log as it stands now (queued behind any saves made
  // during the network calls). This also repairs any state that drifted from
  // the log, e.g. a session that kept playing while answers arrived.
  await repository.rebuildStates((log) => replayStates(scheduler, log));

  const remoteLessonIds = new Set(remoteLessons.map((l) => l.lesson_id));
  const lessonsToPush = [...local.completedLessons]
    .filter(([id]) => !remoteLessonIds.has(id))
    .map(([lesson_id, completed_at]) => ({ lesson_id, completed_at }));
  if (lessonsToPush.length > 0) await remote.pushLessons(lessonsToPush);

  const lessonsToPull = remoteLessons.filter((l) => !local.completedLessons.has(l.lesson_id));
  for (const lesson of lessonsToPull) {
    await repository.completeLesson(lesson.lesson_id as LessonId, new Date(lesson.completed_at));
  }

  return {
    pushedAnswers: toPush.length,
    pulledAnswers: incoming.length,
    pushedLessons: lessonsToPush.length,
    pulledLessons: lessonsToPull.length,
  };
}
