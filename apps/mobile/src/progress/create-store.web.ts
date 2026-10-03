import { MemoryStore, type KeyValueStore } from './store';

/**
 * Web: the browser's localStorage, so progress survives a reload. Falls back to
 * memory when storage is unavailable (e.g. some private-browsing modes).
 */
export function createStore(): KeyValueStore {
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
    const probe = '__bk_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
  } catch {
    return new MemoryStore();
  }
  const local = storage;
  return {
    get: (key) => Promise.resolve(local.getItem(key)),
    set: (key, value) => Promise.resolve(local.setItem(key, value)),
    remove: (key) => Promise.resolve(local.removeItem(key)),
    keys: () =>
      Promise.resolve(
        Array.from({ length: local.length }, (_, i) => local.key(i)).filter(
          (k): k is string => k !== null,
        ),
      ),
  };
}
