import type { LessonId, ReviewLogEntry } from '@ball-knowledge/core';
import { createScheduler, type ReviewResult, type Scheduler } from '@ball-knowledge/retention';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppContent } from '../content/bundle';
import { content as bundledContent } from '../content/content';
import { createStore } from '../progress/create-store';
import {
  createProgressRepository,
  type Progress,
  type ProgressRepository,
} from '../progress/repository';
import type { KeyValueStore } from '../progress/store';
import { readSavedTips, toggleSavedTip } from '../rewards/saved-tips';
import { createTaskQueue } from '../sync/runner';
import { advanceClock, createClock, loadClockOffset, type Clock } from '../session/clock';
import {
  chooseTrack,
  markOnboarded,
  readPreferences,
  withPreference,
  type ChosenTrack,
  type SportPreferences,
} from '../session/preferences';

interface Loaded {
  readonly progress: Progress;
  readonly log: readonly ReviewLogEntry[];
  readonly clock: Clock;
  readonly preferences: ReadonlyMap<string, SportPreferences>;
}

interface AppState {
  readonly content: AppContent;
  readonly scheduler: Scheduler;
  readonly repository: ProgressRepository;
  /** The device key-value store (for small settings such as the sync owner). */
  readonly store: KeyValueStore;
  /** Null while loading from storage. */
  readonly progress: Progress | null;
  /** The answer log (oldest first); empty while loading. */
  readonly log: readonly ReviewLogEntry[];
  /** The app's notion of "now" (real time plus any dev offset). */
  readonly clock: Clock;
  readonly error: string | null;
  readonly reload: () => void;
  /** Saves answers in order, then refreshes progress. */
  readonly saveResults: (results: readonly ReviewResult[]) => Promise<void>;
  readonly completeLesson: (lessonId: LessonId) => Promise<void>;
  /** Dev builds only: move the clock forward to test spacing. */
  readonly advanceDays: (days: number) => Promise<void>;
  /** Onboarding choices per sport (empty while loading). */
  readonly preferences: ReadonlyMap<string, SportPreferences>;
  readonly finishOnboarding: (sportId: string) => Promise<void>;
  readonly setTrack: (sportId: string, track: ChosenTrack) => Promise<void>;
  /** Memory tips saved to "My tips", newest first. */
  readonly savedTips: readonly string[];
  readonly toggleSavedTip: (tipId: string) => Promise<void>;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const scheduler = useMemo(() => createScheduler(), []);
  const store = useMemo(() => createStore(), []);
  const repository = useMemo(() => createProgressRepository(store), [store]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const sportIds = bundledContent.sports.map((sport) => sport.id);
    Promise.all([
      repository.load(),
      repository.reviewLog(),
      loadClockOffset(store),
      Promise.all(sportIds.map((id) => readPreferences(store, id))),
    ]).then(
      ([progress, log, offset, prefs]) => {
        if (!cancelled) {
          const preferences = new Map(sportIds.map((id, i) => [id, prefs[i]!] as const));
          setLoaded({
            progress,
            log,
            clock: createClock(__DEV__ ? offset : 0),
            preferences,
          });
          setError(null);
        }
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repository, store, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const saveResults = useCallback(
    async (results: readonly ReviewResult[]) => {
      for (const r of results) await repository.saveReview(r.state, r.logEntry);
      reload();
    },
    [repository, reload],
  );

  const completeLesson = useCallback(
    async (lessonId: LessonId) => {
      await repository.completeLesson(lessonId, (loaded?.clock ?? createClock(0)).now());
      reload();
    },
    [repository, reload, loaded],
  );

  const advanceDays = useCallback(
    async (days: number) => {
      if (!__DEV__) return;
      await advanceClock(store, days);
      reload();
    },
    [store, reload],
  );

  /**
   * Applies a preference change in memory right away, so a screen that navigates
   * immediately afterwards sees it (the full reload lands a moment later).
   */
  const updatePreferences = useCallback(
    (sportId: string, change: Partial<SportPreferences>) =>
      setLoaded((prev) =>
        prev ? { ...prev, preferences: withPreference(prev.preferences, sportId, change) } : prev,
      ),
    [],
  );

  const finishOnboarding = useCallback(
    async (sportId: string) => {
      await markOnboarded(store, sportId);
      updatePreferences(sportId, { onboarded: true });
      reload();
    },
    [store, reload, updatePreferences],
  );

  const setTrack = useCallback(
    async (sportId: string, track: ChosenTrack) => {
      await chooseTrack(store, sportId, track);
      updatePreferences(sportId, { track });
      reload();
    },
    [store, reload, updatePreferences],
  );

  // Saved tips live outside the reload snapshot, so a reload that started earlier
  // can never overwrite a newer save. Toggles run one at a time, in order.
  const [savedTips, setSavedTips] = useState<readonly string[]>([]);
  const tipQueue = useMemo(() => createTaskQueue(), []);
  useEffect(() => {
    let cancelled = false;
    readSavedTips(store).then(
      (tips) => {
        if (!cancelled) setSavedTips(tips);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [store]);

  const toggleTip = useCallback(
    (tipId: string) => {
      return tipQueue(() => toggleSavedTip(store, tipId)).then((next) => setSavedTips(next));
    },
    [store, tipQueue],
  );

  const value = useMemo<AppState>(
    () => ({
      content: bundledContent,
      scheduler,
      repository,
      store,
      progress: loaded?.progress ?? null,
      log: loaded?.log ?? [],
      clock: loaded?.clock ?? createClock(0),
      error,
      reload,
      saveResults,
      completeLesson,
      advanceDays,
      preferences: loaded?.preferences ?? new Map(),
      finishOnboarding,
      setTrack,
      savedTips,
      toggleSavedTip: toggleTip,
    }),
    [
      scheduler,
      repository,
      store,
      loaded,
      error,
      reload,
      saveResults,
      completeLesson,
      advanceDays,
      finishOnboarding,
      setTrack,
      toggleTip,
      savedTips,
    ],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('useAppState must be used inside <AppStateProvider>');
  return state;
}

/** Lesson ids the user has completed (empty while progress loads). */
export function useCompletedLessons(): ReadonlySet<string> {
  const { progress } = useAppState();
  return useMemo(() => new Set(progress?.completedLessons.keys() ?? []), [progress]);
}
