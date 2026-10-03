import type { KeyValueStore } from '../progress/store';

/** Which account this device's progress belongs to (absent until the first sign-in). */
export const OWNER_KEY = 'bk:sync:owner';

/**
 * What to do with this device's progress when `userId` signs in:
 * - `claim`: no account owns it yet (e.g. progress made before signing in), so it
 *   joins this account.
 * - `match`: it already belongs to this account; sync normally.
 * - `conflict`: it belongs to a different account. Never merge two people's
 *   learning; the user must explicitly choose to replace this device's copy.
 */
export type Ownership = 'claim' | 'match' | 'conflict';

export function ownershipFor(owner: string | null, userId: string): Ownership {
  if (owner === null) return 'claim';
  return owner === userId ? 'match' : 'conflict';
}

export const readOwner = (store: KeyValueStore) => store.get(OWNER_KEY);
export const writeOwner = (store: KeyValueStore, userId: string) => store.set(OWNER_KEY, userId);
export const clearOwner = (store: KeyValueStore) => store.remove(OWNER_KEY);
