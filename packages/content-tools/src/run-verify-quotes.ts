import { existsSync, statSync } from 'node:fs';
import { checkContent } from './check';
import { loadContentDir } from './load';
import { verifyQuotes, type FetchPage } from './quotes';
import type { CliIo } from './run-cli';

export const VERIFY_USAGE = 'Usage: verify-quotes [dir]';

/**
 * Fetches every cited page and confirms each quote appears on it. Returns the exit
 * code: 0 all quotes found, 1 a quote is missing or a page couldn't be read (or the
 * content itself has errors), 2 bad usage.
 */
export async function runVerifyQuotes(
  argv: readonly string[],
  io: CliIo,
  fetchPage: FetchPage,
): Promise<number> {
  if (argv.length > 1 || argv.some((arg) => arg.startsWith('-'))) {
    io.error(VERIFY_USAGE);
    return 2;
  }
  const dir = argv[0] ?? 'content';
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    io.error(`Content directory not found: ${dir}`);
    return 2;
  }
  const result = checkContent(loadContentDir(dir), { mode: 'dev', today: io.today });
  if (result.errors.length > 0) {
    io.error(`Content has ${result.errors.length} error(s); run content:check first.`);
    return 1;
  }

  const checks = await verifyQuotes(result.content.items, fetchPage);
  for (const c of checks) {
    if (c.status === 'ok') continue;
    const where = `${c.itemId} sources.${c.sourceIndex}${c.locator ? ` (${c.locator})` : ''}`;
    if (c.status === 'no_quote') io.log(`  warning  ${where}: no quote to verify`);
    else if (c.status === 'missing')
      io.log(`  MISSING  ${where}: "${c.detail ?? ''}" not on ${c.url}`);
    else io.log(`  FAILED   ${where}: couldn't read ${c.url}: ${c.detail ?? ''}`);
  }
  const count = (status: string) => checks.filter((c) => c.status === status).length;
  const bad = count('missing') + count('fetch_failed');
  io.log(
    `${bad === 0 ? 'OK' : 'FAILED'}: ${count('ok')} quote(s) verified, ${count('missing')} missing, ` +
      `${count('fetch_failed')} unreadable, ${count('no_quote')} without a quote`,
  );
  return bad === 0 ? 0 : 1;
}
