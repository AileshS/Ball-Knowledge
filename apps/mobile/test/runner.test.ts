import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/progress/store';
import { readSavedTips, toggleSavedTip } from '../src/rewards/saved-tips';
import { createSerialRunner, createTaskQueue } from '../src/sync/runner';

describe('createSerialRunner', () => {
  it('runs one at a time and queues exactly one follow-up', async () => {
    let runs = 0;
    let release: () => void = () => undefined;
    const run = createSerialRunner(async () => {
      runs += 1;
      if (runs === 1) await new Promise<void>((r) => (release = r));
    });
    const first = run();
    const second = run();
    const third = run();
    expect(runs).toBe(1);
    release();
    await Promise.all([first, second, third]);
    expect(runs).toBe(2);
    await run();
    expect(runs).toBe(3);
  });

  it('recovers after a failed run', async () => {
    let fail = true;
    const run = createSerialRunner(() => {
      if (fail) {
        fail = false;
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve();
    });
    await expect(run()).rejects.toThrow('offline');
    await expect(run()).resolves.toBeUndefined();
  });
});

describe('createTaskQueue', () => {
  it('runs queued tasks in order, each after the previous finished', async () => {
    const queue = createTaskQueue();
    const order: string[] = [];
    const slow = queue(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('slow');
    });
    const fast = queue(() => {
      order.push('fast');
      return Promise.resolve();
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['slow', 'fast']);
  });

  it('keeps going after a failed task', async () => {
    const queue = createTaskQueue();
    await expect(queue(() => Promise.reject(new Error('nope')))).rejects.toThrow('nope');
    await expect(queue(() => Promise.resolve(7))).resolves.toBe(7);
  });

  it('makes quick tip toggles add up correctly (double-tap cancels out)', async () => {
    const store = new MemoryStore();
    const queue = createTaskQueue();
    await Promise.all([
      queue(() => toggleSavedTip(store, 'tip.a')),
      queue(() => toggleSavedTip(store, 'tip.a')),
      queue(() => toggleSavedTip(store, 'tip.b')),
      queue(() => toggleSavedTip(store, 'tip.c')),
    ]);
    expect(await readSavedTips(store)).toEqual(['tip.c', 'tip.b']);
  });
});
