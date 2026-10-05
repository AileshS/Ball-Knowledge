import type { Track } from '@ball-knowledge/core';
import type { KeyValueStore } from '../progress/store';

/** Past or Present: the track a user follows after Foundations (PRD §6). */
export type ChosenTrack = Extract<Track, 'past' | 'present'>;

/** Per-sport onboarding choices, kept on this device. */
export interface SportPreferences {
  readonly onboarded: boolean;
  readonly track: ChosenTrack | null;
}

const key = (kind: 'onboarded' | 'track', sportId: string) => `bk:pref:${kind}:${sportId}`;

export async function readPreferences(
  store: KeyValueStore,
  sportId: string,
): Promise<SportPreferences> {
  const [onboarded, track] = await Promise.all([
    store.get(key('onboarded', sportId)),
    store.get(key('track', sportId)),
  ]);
  return {
    onboarded: onboarded === 'true',
    track: track === 'past' || track === 'present' ? track : null,
  };
}

export const markOnboarded = (store: KeyValueStore, sportId: string) =>
  store.set(key('onboarded', sportId), 'true');

export const chooseTrack = (store: KeyValueStore, sportId: string, track: ChosenTrack) =>
  store.set(key('track', sportId), track);

/** Lesson order across tracks: Foundations first, then the chosen track, then the other. */
export function trackOrder(chosen: ChosenTrack | null): readonly Track[] {
  if (chosen === 'present') return ['foundations', 'present', 'past'];
  return ['foundations', 'past', 'present'];
}

/** A copy of the preferences map with one sport's choices changed. */
export function withPreference(
  preferences: ReadonlyMap<string, SportPreferences>,
  sportId: string,
  change: Partial<SportPreferences>,
): Map<string, SportPreferences> {
  const current = preferences.get(sportId) ?? { onboarded: false, track: null };
  return new Map(preferences).set(sportId, { ...current, ...change });
}
