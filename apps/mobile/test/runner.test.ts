import { describe, expect, it } from 'vitest';
import { createSerialRunner } from '../src/sync/runner';

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
