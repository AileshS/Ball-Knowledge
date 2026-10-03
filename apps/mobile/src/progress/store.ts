/**
 * The minimal storage the app needs. Each platform supplies one (expo-sqlite's
 * key-value store on iOS/Android, localStorage on web), and everything above it,
 * including the repository, is shared and tested once.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** In-memory store for tests and as a last-resort fallback. */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.data.get(key) ?? null);
  }
  set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
  keys(): Promise<string[]> {
    return Promise.resolve([...this.data.keys()]);
  }
}
