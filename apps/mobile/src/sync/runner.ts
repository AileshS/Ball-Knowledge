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
