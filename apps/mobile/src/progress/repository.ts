import {
  ReviewLogEntrySchema,
  UserItemStateSchema,
  type ItemId,
  type LessonId,
  type ReviewLogEntry,
  type UserItemState,
} from '@ball-knowledge/core';
import type { KeyValueStore } from './store';

/** Everything the app remembers about the user's learning, on this device. */
export interface Progress {
  readonly states: ReadonlyMap<ItemId, UserItemState>;
  /** Lesson id → when it was completed (ISO string). */
  readonly completedLessons: ReadonlyMap<string, string>;
  /** Stored records that couldn't be read; kept untouched, never deleted. */
  readonly unreadableKeys: readonly string[];
}

export interface ProgressRepository {
  load(): Promise<Progress>;
  /** Saves an item's new state and appends its answer to the review log. */
  saveReview(state: UserItemState, logEntry: ReviewLogEntry): Promise<void>;
  completeLesson(lessonId: LessonId, at: Date): Promise<void>;
  /** The append-only answer log (oldest first): the basis for sync and analytics. */
  reviewLog(): Promise<ReviewLogEntry[]>;
}

/** Bumped only with a forward migration; older app versions refuse newer data. */
export const SCHEMA_VERSION = 1;

const PREFIX = 'bk:';
const KEY = {
  schema: `${PREFIX}schema`,
  lessons: `${PREFIX}lessons`,
  state: (id: string) => `${PREFIX}state:${id}`,
  /** The log is chunked by UTC day so an append never rewrites the whole history. */
  log: (day: string) => `${PREFIX}log:${day}`,
};

const toJson = (value: unknown) =>
  JSON.stringify(value, (_k, v: unknown) => (v instanceof Date ? v.toISOString() : v));

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Stores progress as small records: one per item, one log chunk per day, one for
 * lessons. Writes are serialized so concurrent saves can't lose an append.
 */
export function createProgressRepository(store: KeyValueStore): ProgressRepository {
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  let ready: Promise<void> | undefined;
  const ensureSchema = () =>
    (ready ??= (async () => {
      const raw = await store.get(KEY.schema);
      const version = raw === null ? null : Number(raw);
      if (version === null) await store.set(KEY.schema, String(SCHEMA_VERSION));
      else if (!(version >= 1 && version <= SCHEMA_VERSION)) {
        // Never overwrite data written by a newer (or unknown) app version.
        throw new Error(`Saved progress uses format ${raw}; please update the app.`);
      }
    })().catch((e: unknown) => {
      // Don't cache a failure: a transient storage error must be retryable.
      ready = undefined;
      throw e;
    }));

  const readLessons = async () => {
    const raw = await store.get(KEY.lessons);
    const parsed = raw === null ? {} : parseJson(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  };

  return {
    async load() {
      await ensureSchema();
      const states = new Map<ItemId, UserItemState>();
      const unreadableKeys: string[] = [];
      for (const key of (await store.keys()).sort()) {
        if (!key.startsWith(KEY.state(''))) continue;
        const raw = await store.get(key);
        const result = UserItemStateSchema.safeParse(raw === null ? null : parseJson(raw));
        if (result.success) states.set(result.data.itemId, result.data);
        else unreadableKeys.push(key);
      }
      const completed = await readLessons();
      return {
        states,
        completedLessons: new Map(Object.entries(completed)),
        unreadableKeys,
      };
    },

    saveReview(state, logEntry) {
      return serialized(async () => {
        await ensureSchema();
        if (state.itemId !== logEntry.itemId) {
          throw new Error('State and log entry are for different items');
        }
        const dayKey = KEY.log(logEntry.reviewedAt.toISOString().slice(0, 10));
        const existing = await store.get(dayKey);
        const parsed = existing === null ? [] : parseJson(existing);
        if (!Array.isArray(parsed)) {
          // Don't destroy a chunk we can't read; refuse before writing anything.
          throw new Error(`Review log chunk ${dayKey} is unreadable`);
        }
        // Log first: it's the source of truth (ADR 0003). If the state write fails
        // afterwards, replaying the log can rebuild it; the reverse can't be repaired.
        await store.set(dayKey, toJson([...(parsed as unknown[]), logEntry]));
        await store.set(KEY.state(state.itemId), toJson(state));
      });
    },

    completeLesson(lessonId, at) {
      return serialized(async () => {
        await ensureSchema();
        const lessons = await readLessons();
        lessons[lessonId] ??= at.toISOString();
        await store.set(KEY.lessons, toJson(lessons));
      });
    },

    async reviewLog() {
      await ensureSchema();
      const entries: ReviewLogEntry[] = [];
      const days = (await store.keys()).filter((k) => k.startsWith(KEY.log(''))).sort();
      for (const key of days) {
        const raw = await store.get(key);
        const list = raw === null ? [] : parseJson(raw);
        if (!Array.isArray(list)) continue;
        for (const value of list) {
          const result = ReviewLogEntrySchema.safeParse(value);
          if (result.success) entries.push(result.data);
        }
      }
      return entries;
    },
  };
}
