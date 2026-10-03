import './polyfill';
import { createClient } from '@supabase/supabase-js';
import { authStorage } from './auth-storage';
import type { SupabaseConfig } from './config';
import type { RemoteLessonRow, RemoteLogRow, SyncRemote } from './sync';

export function createSupabase(config: SupabaseConfig) {
  return createClient(config.url, config.anonKey, {
    auth: {
      ...(authStorage ? { storage: authStorage } : {}),
      persistSession: true,
      autoRefreshToken: true,
      // Sign-in uses a 6-digit email code, never a link, so no URL handling.
      detectSessionInUrl: false,
    },
  });
}

export type BallKnowledgeClient = ReturnType<typeof createSupabase>;

/** Supabase caps a response at 1,000 rows, so reads page through. */
const PAGE = 1000;
const LOG_COLUMNS =
  'id,item_id,reviewed_at,grade,correct,cue,exercise_type,context,response_ms,days_since_first_learned';

async function pageThrough<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw toError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : String(error);
  return new Error(message);
}

/** The server side of sync, scoped to the signed-in user by row-level security. */
export function supabaseRemote(client: BallKnowledgeClient): SyncRemote {
  return {
    pullLog: () =>
      pageThrough<RemoteLogRow>((from, to) =>
        client.from('review_log').select(LOG_COLUMNS).order('id').range(from, to),
      ),
    async pushLog(rows) {
      for (let i = 0; i < rows.length; i += PAGE) {
        const { error } = await client
          .from('review_log')
          .upsert(rows.slice(i, i + PAGE), { onConflict: 'user_id,id', ignoreDuplicates: true });
        if (error) throw toError(error);
      }
    },
    pullLessons: () =>
      pageThrough<RemoteLessonRow>((from, to) =>
        client
          .from('lesson_completions')
          .select('lesson_id,completed_at')
          .order('lesson_id')
          .range(from, to),
      ),
    async pushLessons(rows) {
      const { error } = await client
        .from('lesson_completions')
        .upsert([...rows], { onConflict: 'user_id,lesson_id', ignoreDuplicates: true });
      if (error) throw toError(error);
    },
  };
}
