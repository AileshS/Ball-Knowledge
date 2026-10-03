import type { ItemId, LessonId, ReviewLogEntry, UserItemState } from '@ball-knowledge/core';
import { createScheduler } from '@ball-knowledge/retention';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../src/progress/create-store.web';
import { createProgressRepository, SCHEMA_VERSION } from '../src/progress/repository';
import { MemoryStore } from '../src/progress/store';

const scheduler = createScheduler();
const item = (n: number) => `fixture.item.n${n}` as ItemId;

function review(id: ItemId, at: string, previous?: UserItemState) {
  return scheduler.applyReview(previous ?? scheduler.newItemState(id, new Date(at)), {
    grade: 'good',
    now: new Date(at),
    cue: 'name',
    exerciseType: 'multiple_choice',
    context: 'lesson',
  });
}

describe('createProgressRepository', () => {
  it('starts empty and records the storage format version', async () => {
    const store = new MemoryStore();
    const progress = await createProgressRepository(store).load();
    expect(progress.states.size).toBe(0);
    expect(progress.completedLessons.size).toBe(0);
    expect(await store.get('bk:schema')).toBe(String(SCHEMA_VERSION));
  });

  it('round-trips item states with real Dates', async () => {
    const store = new MemoryStore();
    const first = review(item(1), '2026-10-01T09:00:00Z');
    await createProgressRepository(store).saveReview(first.state, first.logEntry);

    const loaded = await createProgressRepository(store).load();
    const state = loaded.states.get(item(1));
    expect(state?.due).toBeInstanceOf(Date);
    expect(state).toEqual(first.state);
  });

  it('appends the review log in order, chunked by day', async () => {
    const store = new MemoryStore();
    const repo = createProgressRepository(store);
    const a = review(item(1), '2026-10-01T09:00:00Z');
    const b = review(item(1), '2026-10-01T09:05:00Z', a.state);
    const c = review(item(1), '2026-10-03T09:00:00Z', b.state);
    for (const r of [a, b, c]) await repo.saveReview(r.state, r.logEntry);

    const log = await repo.reviewLog();
    expect(log.map((e) => e.reviewedAt.toISOString())).toEqual([
      '2026-10-01T09:00:00.000Z',
      '2026-10-01T09:05:00.000Z',
      '2026-10-03T09:00:00.000Z',
    ]);
    expect((await store.keys()).filter((k) => k.startsWith('bk:log:')).sort()).toEqual([
      'bk:log:2026-10-01',
      'bk:log:2026-10-03',
    ]);
  });

  it('never loses an append when saves race', async () => {
    const repo = createProgressRepository(new MemoryStore());
    const saves = Array.from({ length: 20 }, (_, i) => {
      const r = review(item(i), '2026-10-01T09:00:00Z');
      return repo.saveReview(r.state, r.logEntry);
    });
    await Promise.all(saves);
    expect(await repo.reviewLog()).toHaveLength(20);
    expect((await repo.load()).states.size).toBe(20);
  });

  it('remembers when a lesson was first completed', async () => {
    const repo = createProgressRepository(new MemoryStore());
    const lesson = 'fixture.lesson.one' as LessonId;
    await repo.completeLesson(lesson, new Date('2026-10-01T09:00:00Z'));
    await repo.completeLesson(lesson, new Date('2026-10-02T09:00:00Z'));
    expect((await repo.load()).completedLessons.get(lesson)).toBe('2026-10-01T09:00:00.000Z');
  });

  it('refuses to touch data written by a newer app version', async () => {
    const store = new MemoryStore();
    await store.set('bk:schema', String(SCHEMA_VERSION + 1));
    const repo = createProgressRepository(store);
    await expect(repo.load()).rejects.toThrow(/please update the app/);
    const r = review(item(1), '2026-10-01T09:00:00Z');
    await expect(repo.saveReview(r.state, r.logEntry)).rejects.toThrow(/please update the app/);
    expect(await store.keys()).toEqual(['bk:schema']);
  });

  it('keeps unreadable records instead of deleting them', async () => {
    const store = new MemoryStore();
    await store.set('bk:state:fixture.item.n1', '{not json');
    await store.set('bk:lessons', '[]');
    const progress = await createProgressRepository(store).load();
    expect(progress.unreadableKeys).toEqual(['bk:state:fixture.item.n1']);
    expect(progress.completedLessons.size).toBe(0);
    expect(await store.get('bk:state:fixture.item.n1')).toBe('{not json');
  });

  it('refuses to overwrite an unreadable log chunk, and skips bad entries when reading', async () => {
    const store = new MemoryStore();
    const repo = createProgressRepository(store);
    await store.set('bk:log:2026-10-01', '{oops');
    const r = review(item(1), '2026-10-01T09:00:00Z');
    await expect(repo.saveReview(r.state, r.logEntry)).rejects.toThrow(/unreadable/);
    expect(await store.get('bk:log:2026-10-01')).toBe('{oops');

    await store.set('bk:log:2026-10-02', JSON.stringify([{ nonsense: true }, r.logEntry]));
    expect(await repo.reviewLog()).toHaveLength(1);
  });

  it('writes nothing when the day’s log chunk is unreadable', async () => {
    const store = new MemoryStore();
    await store.set('bk:log:2026-10-01', '{oops');
    const r = review(item(1), '2026-10-01T09:00:00Z');
    await expect(createProgressRepository(store).saveReview(r.state, r.logEntry)).rejects.toThrow();
    expect(await store.get('bk:state:fixture.item.n1')).toBeNull();
  });

  it('recovers after a transient storage failure instead of caching it', async () => {
    const store = new MemoryStore();
    let failNext = true;
    const flaky = {
      ...store,
      get: (key: string) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error('database is locked'));
        }
        return store.get(key);
      },
      set: (k: string, v: string) => store.set(k, v),
      remove: (k: string) => store.remove(k),
      keys: () => store.keys(),
    };
    const repo = createProgressRepository(flaky);
    await expect(repo.load()).rejects.toThrow('database is locked');
    await expect(repo.load()).resolves.toMatchObject({ unreadableKeys: [] });
  });

  it('rejects a state and log entry for different items', async () => {
    const a = review(item(1), '2026-10-01T09:00:00Z');
    const b = review(item(2), '2026-10-01T09:00:00Z');
    const mixed: ReviewLogEntry = b.logEntry;
    await expect(
      createProgressRepository(new MemoryStore()).saveReview(a.state, mixed),
    ).rejects.toThrow(/different items/);
  });
});

describe('web storage (localStorage)', () => {
  const original = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
  });

  function fakeLocalStorage() {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  it('persists through localStorage', async () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };
    const store = createStore();
    await store.set('bk:a', '1');
    await store.set('bk:b', '2');
    await store.remove('bk:a');
    expect(await store.get('bk:b')).toBe('2');
    expect(await store.keys()).toEqual(['bk:b']);
  });

  it('falls back to memory when localStorage is unavailable', async () => {
    (globalThis as { window?: unknown }).window = {
      get localStorage(): never {
        throw new Error('blocked');
      },
    };
    const store = createStore();
    expect(store).toBeInstanceOf(MemoryStore);
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
  });
});
