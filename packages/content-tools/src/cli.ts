/**
 * Content CLI entry point (see run-cli.ts).
 *   check [dir] [--ship]                 validate content (default dir: content)
 *   build [dir] [--ship] [--out <dir>]   validate, then write <out>/content.json
 */
import { runCli } from './run-cli';

/** The author's local calendar date, matching how people write `lastVerifiedAt`. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

process.exitCode = runCli(process.argv.slice(2), {
  today: today(),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
});
