import { Storage } from 'expo-sqlite/kv-store';

/** iOS/Android: keep the sign-in session in expo-sqlite's key-value store. */
export const authStorage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} | null = {
  getItem: (key) => Storage.getItemAsync(key),
  setItem: (key, value) => Storage.setItemAsync(key, value),
  removeItem: async (key) => {
    await Storage.removeItemAsync(key);
  },
};
