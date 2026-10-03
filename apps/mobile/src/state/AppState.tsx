import { createScheduler, type Scheduler } from '@ball-knowledge/retention';
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

interface AppState {
  readonly content: AppContent;
  readonly scheduler: Scheduler;
  readonly repository: ProgressRepository;
  /** Null while loading from storage. */
  readonly progress: Progress | null;
  readonly error: string | null;
  readonly reload: () => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const scheduler = useMemo(() => createScheduler(), []);
  const repository = useMemo(() => createProgressRepository(createStore()), []);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    repository.load().then(
      (loaded) => {
        if (!cancelled) setProgress(loaded);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repository, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({ content: bundledContent, scheduler, repository, progress, error, reload }),
    [scheduler, repository, progress, error, reload],
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
