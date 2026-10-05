import { content } from '../content/content';

/**
 * Dev tools (the exercise gallery) show in development builds, or in a preview
 * build made with EXPO_PUBLIC_DEV_TOOLS=1 (handy for testers). A release build
 * ships the approved-only content bundle (`--ship`), so even with the flag set by
 * mistake, dev tools stay hidden there.
 */
export const SHOW_DEV_TOOLS: boolean =
  __DEV__ ||
  ((process.env.EXPO_PUBLIC_DEV_TOOLS as string | undefined) === '1' && content.mode === 'dev');
