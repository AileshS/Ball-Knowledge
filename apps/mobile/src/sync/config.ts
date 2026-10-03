export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * Supabase settings from `apps/mobile/.env` (see `.env.example`). Expo inlines
 * `EXPO_PUBLIC_*` variables at build time, which only works when they're written
 * out literally, hence the default parameters. Returns null when accounts aren't
 * configured; the app then works fully offline.
 */
export function readSupabaseConfig(
  url: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined,
  anonKey: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined,
): SupabaseConfig | null {
  const cleanUrl = url?.trim() ?? '';
  const cleanKey = anonKey?.trim() ?? '';
  if (!/^https:\/\/[^\s/]+$/.test(cleanUrl.replace(/\/$/, '')) || cleanKey === '') return null;
  return { url: cleanUrl.replace(/\/$/, ''), anonKey: cleanKey };
}
