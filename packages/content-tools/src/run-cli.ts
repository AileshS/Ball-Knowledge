import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBundle } from './build';
import { checkContent, type CheckMode, type CheckResult } from './check';
import { loadContentDir } from './load';

export interface CliIo {
  /** Today's date (YYYY-MM-DD). */
  readonly today: string;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

export const USAGE = 'Usage: content <check|build> [dir] [--ship] [--out <dir>]';

const KNOWN_FLAGS: ReadonlySet<string> = new Set(['--ship', '--out']);

function printReport(result: CheckResult, mode: CheckMode, log: CliIo['log']): void {
  const c = result.content;
  log(
    `Checked (${mode}): ${c.sports.length} sport(s), ${c.units.length} unit(s), ${c.lessons.length} lesson(s), ` +
      `${c.items.length} item(s), ${c.exercises.length} exercise(s), ${c.entities.length} entities, ${c.tips.length} tip(s)`,
  );
  for (const w of result.warnings) log(`  warning  ${w.where}: ${w.message}`);
  for (const e of result.errors) log(`  ERROR    ${e.where}: ${e.message}`);
  const stale = result.freshness.filter((f) => f.stale);
  if (result.freshness.length > 0) {
    log(`Freshness: ${result.freshness.length} present-track item(s), ${stale.length} stale`);
  }
  log(
    result.errors.length === 0
      ? `OK: 0 errors, ${result.warnings.length} warning(s)`
      : `FAILED: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
  );
}

/**
 * Runs `check` or `build` and returns the exit code: 0 ok, 1 content errors,
 * 2 bad usage. CI fails on anything but 0.
 */
export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  if (command !== 'check' && command !== 'build') {
    io.error(USAGE);
    return 2;
  }
  // Reject unknown flags: a typo like `--Ship` must never silently build in dev mode.
  const unknown = rest.filter((arg) => arg.startsWith('-') && !KNOWN_FLAGS.has(arg));
  if (unknown.length > 0) {
    io.error(`Unknown option(s): ${unknown.join(', ')}\n${USAGE}`);
    return 2;
  }
  const mode: CheckMode = rest.includes('--ship') ? 'ship' : 'dev';
  const outIndex = rest.indexOf('--out');
  const outDir = outIndex >= 0 ? rest[outIndex + 1] : 'dist/content';
  if (outDir === undefined || outDir.startsWith('--')) {
    io.error('--out needs a directory');
    return 2;
  }
  const dir =
    rest.find((arg, i) => !arg.startsWith('--') && (outIndex < 0 || i !== outIndex + 1)) ??
    'content';
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    io.error(`Content directory not found: ${dir}`);
    return 2;
  }

  const result = checkContent(loadContentDir(dir), { mode, today: io.today });
  printReport(result, mode, io.log);
  if (result.errors.length > 0) return 1;

  if (command === 'build') {
    const bundle = buildBundle(result, mode, io.today);
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, 'content.json');
    writeFileSync(file, `${JSON.stringify(bundle, null, 2)}\n`);
    io.log(`Wrote ${file}`);
  }
  return 0;
}
