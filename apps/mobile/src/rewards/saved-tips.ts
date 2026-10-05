import type { KeyValueStore } from '../progress/store';

/** Memory tips the user saved to "My tips" (PRD §8), kept on this device. */
export const SAVED_TIPS_KEY = 'bk:pref:savedTips';

export async function readSavedTips(store: KeyValueStore): Promise<string[]> {
  const raw = await store.get(SAVED_TIPS_KEY);
  try {
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The list with `tipId` added (newest first) or removed. */
export function toggled(saved: readonly string[], tipId: string): string[] {
  return saved.includes(tipId) ? saved.filter((id) => id !== tipId) : [tipId, ...saved];
}

export async function toggleSavedTip(store: KeyValueStore, tipId: string): Promise<string[]> {
  const next = toggled(await readSavedTips(store), tipId);
  await store.set(SAVED_TIPS_KEY, JSON.stringify(next));
  return next;
}
