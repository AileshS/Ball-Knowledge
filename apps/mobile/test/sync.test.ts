import type { Grade, ItemId, LessonId, ReviewLogEntry } from '@ball-knowledge/core';
import { createScheduler } from '@ball-knowledge/retention';
import { describe, expect, it } from 'vitest';
import { createProgressRepository } from '../src/progress/repository';
import { MemoryStore } from '../src/progress/store';
import { readSupabaseConfig } from '../src/sync/config';
import {
  credentialsProblem,
  friendlyAuthError,
  MIN_PASSWORD_LENGTH,
} from '../src/sync/credentials';
import { clearOwner, ownershipFor, readOwner, writeOwner } from '../src/sync/owner';
import {
  fromRemoteRow,
  logEntryId,
  replayStates,
  syncProgress,
  toRemoteRow,
  type RemoteLessonRow,
  type RemoteLogRow,
  type SyncRemote,
} from '../src/sync/sync';

const scheduler = createScheduler();
const item = (n: number) => `fixture.item.n${n}` as ItemId;

/** An in-memory server that behaves like the Supabase tables (ignore duplicates). */
function fakeRemote() {
  const log = new Map<string, RemoteLogRow>();
  const lessons = new Map<string, RemoteLessonRow>();
  const remote: SyncRemote = {
    pullLog: () => Promise.resolve([...log.values()]),
    pushLog: (rows) => {
      for (const r of rows) if (!log.has(r.id)) log.set(r.id, r);
      return Promise.resolve();
    },
    pullLessons: () => Promise.resolve([...lessons.values()]),
    pushLessons: (rows) => {
      for (const r of rows) if (!lessons.has(r.lesson_id)) lessons.set(r.lesson_id, r);
      return Promise.resolve();
    },
  };
  return { remote, log, lessons };
}

/** A device: its own storage, answering questions the way the app does. */
function device() {
  const repo = createProgressRepository(new MemoryStore());
  return {
    repo,
    async answer(id: ItemId, at: string, grade: Grade = 'good') {
      const { states } = await repo.load();
      const now = new Date(at);
      const r = scheduler.applyReview(states.get(id) ?? scheduler.newItemState(id, now), {
        grade,
        now,
        cue: 'name',
        exerciseType: 'multiple_choice',
        context: 'review',
      });
      await repo.saveReview(r.state, r.logEntry);
    },
  };
}

describe('log rows', () => {
  const entry: ReviewLogEntry = {
    itemId: item(1),
    reviewedAt: new Date('2026-10-03T09:00:00.000Z'),
    grade: 'hard',
    correct: true,
    cue: 'jersey',
    exerciseType: 'identify',
    context: 'review',
    responseMs: 4200,
    daysSinceFirstLearned: 3.5,
  };

  it('round-trips through the server row shape with a deterministic id', () => {
    const row = toRemoteRow(entry);
    expect(row.id).toBe('fixture.item.n1@2026-10-03T09:00:00.000Z');
    expect(logEntryId(entry)).toBe(row.id);
    expect(fromRemoteRow(row)).toEqual(entry);
    const withoutTime: ReviewLogEntry = { ...entry };
    delete withoutTime.responseMs;
    expect(fromRemoteRow(toRemoteRow(withoutTime))).toEqual(withoutTime);
  });

  it('rejects malformed server rows instead of trusting them', () => {
    expect(fromRemoteRow({ ...toRemoteRow(entry), grade: 'excellent' })).toBeNull();
    expect(fromRemoteRow({ ...toRemoteRow(entry), correct: false })).toBeNull();
  });
});

describe('replayStates', () => {
  it('rebuilds exactly the state the device computed live', async () => {
    const d = device();
    await d.answer(item(1), '2026-10-01T09:00:00Z');
    await d.answer(item(1), '2026-10-01T09:05:00Z');
    await d.answer(item(1), '2026-10-04T09:00:00Z', 'again');
    await d.answer(item(2), '2026-10-02T09:00:00Z');
    const live = (await d.repo.load()).states;
    expect(replayStates(scheduler, await d.repo.reviewLog())).toEqual(live);
  });

  it('does not depend on the order entries arrive in', async () => {
    const d = device();
    await d.answer(item(1), '2026-10-01T09:00:00Z');
    await d.answer(item(1), '2026-10-03T09:00:00Z');
    const log = await d.repo.reviewLog();
    expect(replayStates(scheduler, [...log].reverse())).toEqual(replayStates(scheduler, log));
  });
});

describe('syncProgress', () => {
  it('uploads a first device and brings a second one to the same state', async () => {
    const { remote, log } = fakeRemote();
    const phone = device();
    await phone.answer(item(1), '2026-10-01T09:00:00Z');
    await phone.answer(item(2), '2026-10-01T09:01:00Z');
    await phone.repo.completeLesson(
      'fixture.lesson.one' as LessonId,
      new Date('2026-10-01T09:02:00Z'),
    );

    expect(await syncProgress(phone.repo, remote, scheduler)).toEqual({
      pushedAnswers: 2,
      pulledAnswers: 0,
      pushedLessons: 1,
      pulledLessons: 0,
    });
    expect(log.size).toBe(2);

    const laptop = device();
    expect(await syncProgress(laptop.repo, remote, scheduler)).toMatchObject({
      pulledAnswers: 2,
      pulledLessons: 1,
    });
    const [p, l] = [await phone.repo.load(), await laptop.repo.load()];
    expect(l.states).toEqual(p.states);
    expect(l.completedLessons.get('fixture.lesson.one')).toBe('2026-10-01T09:02:00.000Z');
  });

  it('merges answers made offline on two devices into one history', async () => {
    const { remote } = fakeRemote();
    const phone = device();
    const laptop = device();
    await phone.answer(item(1), '2026-10-01T09:00:00Z');
    await syncProgress(phone.repo, remote, scheduler);
    await syncProgress(laptop.repo, remote, scheduler);

    // Both review the same fact while offline, at different times.
    await phone.answer(item(1), '2026-10-03T09:00:00Z');
    await laptop.answer(item(1), '2026-10-05T09:00:00Z', 'again');

    await syncProgress(phone.repo, remote, scheduler);
    await syncProgress(laptop.repo, remote, scheduler);
    await syncProgress(phone.repo, remote, scheduler);

    const phoneLog = await phone.repo.reviewLog();
    expect(phoneLog).toHaveLength(3);
    expect(await laptop.repo.reviewLog()).toEqual(phoneLog);
    expect((await laptop.repo.load()).states).toEqual((await phone.repo.load()).states);
    expect((await phone.repo.load()).states.get(item(1))?.lapses).toBe(1);
  });

  it('is safe to run repeatedly: nothing is sent or fetched twice', async () => {
    const { remote, log } = fakeRemote();
    const d = device();
    await d.answer(item(1), '2026-10-01T09:00:00Z');
    await syncProgress(d.repo, remote, scheduler);
    expect(await syncProgress(d.repo, remote, scheduler)).toEqual({
      pushedAnswers: 0,
      pulledAnswers: 0,
      pushedLessons: 0,
      pulledLessons: 0,
    });
    expect(log.size).toBe(1);
    expect(await d.repo.reviewLog()).toHaveLength(1);
  });

  it('skips malformed server rows', async () => {
    const { remote, log } = fakeRemote();
    log.set('bad', {
      ...toRemoteRow({
        itemId: item(9),
        reviewedAt: new Date('2026-10-01T09:00:00Z'),
        grade: 'good',
        correct: true,
        cue: 'name',
        exerciseType: 'identify',
        context: 'review',
        daysSinceFirstLearned: 0,
      }),
      id: 'bad',
      cue: 'telepathy',
    });
    const d = device();
    await syncProgress(d.repo, remote, scheduler);
    expect(await d.repo.reviewLog()).toEqual([]);
  });
});

describe('sync never loses or corrupts progress made during it', () => {
  it('keeps an answer saved while sync was waiting on the network', async () => {
    const { remote } = fakeRemote();
    const other = device();
    await other.answer(item(2), '2026-10-01T09:00:00Z');
    await syncProgress(other.repo, remote, scheduler);

    const d = device();
    await d.answer(item(1), '2026-10-01T09:00:00Z');
    const slow: SyncRemote = {
      ...remote,
      pullLog: async () => {
        const rows = await remote.pullLog();
        // The user answers again while the pull is in flight.
        await d.answer(item(1), '2026-10-02T09:00:00Z');
        return rows;
      },
    };
    await syncProgress(d.repo, slow, scheduler);
    const log = await d.repo.reviewLog();
    const { states } = await d.repo.load();
    expect(log.filter((e) => e.itemId === item(1))).toHaveLength(2);
    expect(states).toEqual(replayStates(scheduler, log));
    expect(states.get(item(1))?.lastReviewedAt?.toISOString()).toBe('2026-10-02T09:00:00.000Z');
  });

  it('repairs a state that drifted from the log', async () => {
    const { remote } = fakeRemote();
    const store = new MemoryStore();
    const repo = createProgressRepository(store);
    const d = { repo };
    const now = new Date('2026-10-01T09:00:00Z');
    const first = scheduler.applyReview(scheduler.newItemState(item(1), now), {
      grade: 'good',
      now,
      cue: 'name',
      exerciseType: 'identify',
      context: 'review',
    });
    await d.repo.saveReview(first.state, first.logEntry);
    // A stale write (e.g. from a session that started before new answers arrived).
    await store.set('bk:state:fixture.item.n1', JSON.stringify({ ...first.state, reps: 99 }));
    await syncProgress(d.repo, remote, scheduler);
    expect((await d.repo.load()).states.get(item(1))?.reps).toBe(1);
  });
});

describe('repository sync support', () => {
  it('imports answers without duplicating ones already present', async () => {
    const d = device();
    await d.answer(item(1), '2026-10-01T09:00:00Z');
    const [existing] = await d.repo.reviewLog();
    const other: ReviewLogEntry = { ...existing!, reviewedAt: new Date('2026-10-01T08:00:00Z') };
    await d.repo.importLog([existing!, other]);
    const log = await d.repo.reviewLog();
    expect(log).toHaveLength(2);
    expect(log[0]?.reviewedAt.toISOString()).toBe('2026-10-01T08:00:00.000Z');
  });

  it('refuses to import into an unreadable log chunk', async () => {
    const store = new MemoryStore();
    const repo = createProgressRepository(store);
    await store.set('bk:log:2026-10-01', '{oops');
    const d = device();
    await d.answer(item(1), '2026-10-01T09:00:00Z');
    await expect(repo.importLog(await d.repo.reviewLog())).rejects.toThrow(/unreadable/);
    expect(await store.get('bk:log:2026-10-01')).toBe('{oops');
  });

  it('clears only progress keys when asked', async () => {
    const store = new MemoryStore();
    const repo = createProgressRepository(store);
    const d = device();
    await d.answer(item(1), '2026-10-01T09:00:00Z');
    await repo.importLog(await d.repo.reviewLog());
    await repo.rebuildStates((log) => replayStates(scheduler, log));
    await repo.completeLesson('fixture.lesson.one' as LessonId, new Date());
    await store.set('bk:dev:clockOffsetDays', '3');
    await writeOwner(store, 'user-a');

    await repo.clearProgress();
    expect((await store.keys()).sort()).toEqual([
      'bk:dev:clockOffsetDays',
      'bk:schema',
      'bk:sync:owner',
    ]);
  });
});

describe('account ownership', () => {
  it('claims unowned progress, syncs its own, and refuses another account’s', async () => {
    expect(ownershipFor(null, 'user-a')).toBe('claim');
    expect(ownershipFor('user-a', 'user-a')).toBe('match');
    expect(ownershipFor('user-a', 'user-b')).toBe('conflict');

    const store = new MemoryStore();
    expect(await readOwner(store)).toBeNull();
    await writeOwner(store, 'user-a');
    expect(await readOwner(store)).toBe('user-a');
    await clearOwner(store);
    expect(await readOwner(store)).toBeNull();
  });
});

describe('readSupabaseConfig', () => {
  it('accepts an https project URL and a key, trimming a trailing slash', () => {
    expect(readSupabaseConfig(' https://abc.supabase.co/ ', ' key ')).toEqual({
      url: 'https://abc.supabase.co',
      anonKey: 'key',
    });
  });

  it('turns accounts off when settings are missing or wrong', () => {
    expect(readSupabaseConfig(undefined, 'key')).toBeNull();
    expect(readSupabaseConfig('https://abc.supabase.co', '')).toBeNull();
    expect(readSupabaseConfig('http://abc.supabase.co', 'key')).toBeNull();
    expect(readSupabaseConfig('https://abc.supabase.co/rest/v1', 'key')).toBeNull();
  });
});

describe('email and password sign-in', () => {
  it('checks what was typed before sending anything', () => {
    expect(credentialsProblem('not-an-email', 'longenough', 'sign_in')).toBe(
      'Enter a valid email address.',
    );
    expect(credentialsProblem('fan@example.com', '', 'sign_in')).toBe('Enter your password.');
    expect(credentialsProblem('fan@example.com', 'short', 'sign_up')).toBe(
      `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
    );
    expect(credentialsProblem('fan@example.com', 'short', 'sign_in')).toBeNull();
    expect(credentialsProblem(' fan@example.com ', 'longenough', 'sign_up')).toBeNull();
  });

  it('explains Supabase errors in plain words', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe('Wrong email or password.');
    expect(friendlyAuthError('User already registered')).toMatch(/Sign in instead/);
    expect(friendlyAuthError('Email not confirmed')).toMatch(/Confirm email/);
    expect(friendlyAuthError('Password should be at least 6 characters')).toMatch(/too weak/);
    expect(friendlyAuthError('Request rate limit reached')).toMatch(/Too many attempts/);
    expect(friendlyAuthError('Failed to fetch')).toMatch(/Couldn't reach the server/);
    expect(friendlyAuthError('Something unexpected')).toBe('Something unexpected');
  });
});
