/**
 * Runs a task one at a time. A request made while it's running isn't dropped:
 * exactly one follow-up run happens afterwards, so work saved during a sync
 * (e.g. the session that just ended) is always picked up.
 */
export function createSerialRunner(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;

  const start = (): Promise<void> => {
    running = (async () => {
      try {
        do {
          again = false;
          await task();
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  };

  return () => {
    if (running) {
      again = true;
      return running;
    }
    return start();
  };
}

/**
 * Runs async tasks strictly one after another, in the order they were queued.
 * Each task sees the effects of the ones before it (unlike a serial runner, no
 * request is merged away). A failed task doesn't block the ones after it.
 */
export function createTaskQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>) => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
