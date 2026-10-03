import { Storage } from 'expo-sqlite/kv-store';
import type { KeyValueStore } from './store';

/** iOS and Android: expo-sqlite's key-value store (a SQLite table on the device). */
export function createStore(): KeyValueStore {
  return {
    get: (key) => Storage.getItemAsync(key),
    set: (key, value) => Storage.setItemAsync(key, value),
    remove: async (key) => {
      await Storage.removeItemAsync(key);
    },
    keys: () => Storage.getAllKeysAsync(),
  };
}
